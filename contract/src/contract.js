// @ts-check
import '@agoric/zoe/exported.js';
import { assertProposalShape } from '@agoric/zoe/src/contractSupport/index.js';
import { AmountMath, AssetKind } from '@agoric/ertp';
import { lockupStrategies, rewardStrategyTypes, DEFAULT_WARN_MINIMUM_GOVERNANCE_TOKEN_SUPPLY } from './definitions';
import { checkTiers, checkLockupStrategy, checkRewardStrategyType, checkRewardStrategyStructure } from './verifiers';
import { E, Far } from '@endo/far';
import { makeScalarMap } from '@agoric/store';
import { makeLockupManager } from './lockupManager';
import { makeSubscriptionKit, observeNotifier } from '@agoric/notifier';
import { orderTiers, SECONDS_PER_HOUR } from './helpers';

/**
 * Add description
 *
 * @type {ContractStartFn}
 */
const start = async (zcf) => {

  const {
    ammPublicFacet,
    timerService,
    initialSupportedIssuers,
    lockupStrategy,
    rewardStrategy,
    gTokenBrand,
    warnMinimumGovernanceTokenSupply = 0n
  } = zcf.getTerms();

  const { zcfSeat } = zcf.makeEmptySeatKit();
  let totalGovernanceTokenSupply = AmountMath.makeEmpty(gTokenBrand, 'nat');
  const polMint = await zcf.makeZCFMint('PolMint', AssetKind.SET);
  let lockupCounter = 1;
  const lockupsMap = makeScalarMap('lockups');
  const { brand: polBrand, issuer: polIssuer } = polMint.getIssuerRecord();
  const periodNotifier = await E(timerService).makeNotifier(0n, SECONDS_PER_HOUR);
  let warnMinimumGovernanceTokenSupplyAmount;
  if (!warnMinimumGovernanceTokenSupply) warnMinimumGovernanceTokenSupplyAmount = AmountMath.make(gTokenBrand, DEFAULT_WARN_MINIMUM_GOVERNANCE_TOKEN_SUPPLY);
  else warnMinimumGovernanceTokenSupplyAmount = AmountMath.make(gTokenBrand, warnMinimumGovernanceTokenSupply);

  assert(checkLockupStrategy(lockupStrategy), `The given lockup strategy (${lockupStrategy}) is not supported`);
  assert(checkRewardStrategyStructure(rewardStrategy), `The given reward strategy object (${rewardStrategy}) is malformed. Has to have type and definition.`);
  let {
    type: rewardStrategyType,
    definition: rewardStrategyDefinition
  } = rewardStrategy;
  assert(checkRewardStrategyType(rewardStrategyType), `The given reward strategy type (${rewardStrategyType}) is not supported`);

  if (rewardStrategyType === rewardStrategyTypes.TIER) {
    assert(checkTiers(rewardStrategyDefinition), `Tiers for the reward strategy are malformed. Each one has to have tokenAmount and timeAmount`);
    rewardStrategyDefinition = orderTiers(rewardStrategyDefinition);
  }

  assert(!(rewardStrategyType === rewardStrategyTypes.TIER && lockupStrategy === lockupStrategies.UNLOCK), `Reward strategy of type tier is still not supported for the Unlock lockup strategy`);

  const supportedBrands = makeScalarMap('brand');
  const initializeBrands = async () => {
    return harden(
      Promise.all(
        initialSupportedIssuers.map(async issuer => {
          const allegedName = await issuer.getAllegedName();
          await zcf.saveIssuer(issuer, allegedName);
          const brand = zcf.getBrandForIssuer(issuer);
          // Issuers must be in the AMM
          // await E(ammPublicFacet).getLiquidityIssuer(brand);
          supportedBrands.init(brand, true);
        })
      )
    )
  }

  await initializeBrands();

  /**
   * 
   * @param {Issuer} tokenIssuer 
   */
  const addSupportedIssuer = async tokenIssuer => {
    let allegedBrand;
    try {
      allegedBrand = zcf.getBrandForIssuer(tokenIssuer);
    } catch (e) {
      // Issuer is not yet supported
      const allegedIssuerName = await tokenIssuer.getAllegedName();
      await zcf.saveIssuer(tokenIssuer, allegedIssuerName);
      const certainBrand = zcf.getBrandForIssuer(tokenIssuer);
      supportedBrands.init(certainBrand, true);
      return;
    }

    assert(!supportedBrands.has(allegedBrand), `${tokenIssuer.getAllegedName()} issuer is already supported`);
  }

  /**
   * 
   * @param {Issuer} issuer 
   * @returns {Boolean}
   */
  const isIssuerSupported = issuer => {
    try {
      const brand = zcf.getBrandForIssuer(issuer);
      if (supportedBrands.has(brand)) return true;
    } catch (error) {

    }
    return false;
  }

  /**
   * 
   * @param {ZCFSeat} creatorSeat 
   * @returns {String}
   */
  const addRewardLiquidity = (creatorSeat) => {
    assertProposalShape(creatorSeat, {
      give: { Governance: null }
    });

    const { give: { Governance: gTokenAmount } } = creatorSeat.getProposal();

    totalGovernanceTokenSupply = AmountMath.add(totalGovernanceTokenSupply, gTokenAmount);

    zcfSeat.incrementBy(
      creatorSeat.decrementBy(harden({ Governance: gTokenAmount }))
    );

    zcf.reallocate(zcfSeat, creatorSeat);
    creatorSeat.exit();

    return `Governance tokens liquidity increased by ${gTokenAmount.value}`
  };

  /**
   * 
   * @returns {Promise<Invitation>}
   */
  const makeLockupInvitation = () => {

    const lockupHook = async (userSeat, offerArgs) => {
      assertProposalShape(userSeat, {
        give: { LpTokens: null },
        want: { PolToken: null }
      })

      const { give: { LpTokens: lpTokensAmount } } = userSeat.getProposal();
      const { brand } = lpTokensAmount;
      assert(supportedBrands.has(brand), `The brand ${brand} is not supported`);

      const lockupManager = makeLockupManager(
        zcf,
        zcfSeat,
        String(lockupCounter),
        lockupStrategy,
        rewardStrategyType,
        rewardStrategyDefinition,
        timerService,
        polBrand,
        polMint,
        gTokenBrand,
        lpTokensAmount
      )
      const lockupResult = await lockupManager.lockup(userSeat, offerArgs);
      lockupsMap.init(String(lockupCounter), lockupManager);
      lockupCounter += 1;

      userSeat.exit();

      return lockupResult;
    }

    return zcf.makeInvitation(lockupHook, "Lockup");
  }

  /**
   * 
   * @returns {Promise<Invitation>}
   */
  const makeUnlockInvitation = () => {
    assert(lockupStrategy === lockupStrategies.UNLOCK, `This contract does not support the unlocking strategy`);

    const unlockHook = async (userSeat, offerArgs) => {
      assertProposalShape(userSeat, {
        give: { PolToken: null },
        want: { UnbondingToken: null }
      })

      const { give: { PolToken: polTokenAmount } } = userSeat.getProposal();
      const lockupManager = lockupsMap.get(polTokenAmount.value[0].lockupId);
      const unlockResult = await lockupManager.unlock(userSeat, offerArgs);

      userSeat.exit();
      return unlockResult;
    }

    return zcf.makeInvitation(unlockHook, 'Unlock');
  }

  /**
   * 
   * @returns {Promise<Invitation>}
   */
  const makeRedeemInvitation = () => {

    const redeemHook = async (userSeat) => {
      assertProposalShape(userSeat, {
        give: { RedeemToken: null }, // RedeemToken is one of PolToken or UnbondingToken given before
        want: { LpTokens: null },
      });

      const { give: { RedeemToken: redeemTokenAmount } } = userSeat.getProposal();
      const lockupManager = lockupsMap.get(redeemTokenAmount.value[0].lockupId);
      const redeemResult = await lockupManager.redeem(userSeat);
      
      return redeemResult;
    }

    return zcf.makeInvitation(redeemHook, 'Redeem');
  }

  /**
   * 
   * @returns {Promise<Invitation>}
   */
  const makeWithdrawRewardsInvitation = () => {

    const withdrawRewardsHook = async (userSeat) => {
      assertProposalShape(userSeat, {
        give: { WithdrawToken: null },
        want: { Governance: null }
      });

      const { give: { WithdrawToken: withdrawTokenAmount }, want: { Governance: governanceTokenAmount } } = userSeat.getProposal();

      assert(governanceTokenAmount.brand === gTokenBrand, `The given brand ${governanceTokenAmount.brand} is not the brand of the reward governance token`);
      assert(governanceTokenAmount.value < totalGovernanceTokenSupply.value, `There is not enough liquidity to reward that amount`);
      const lockupManager = lockupsMap.get(withdrawTokenAmount.value[0].lockupId);
      const withdrawResult = await lockupManager.withdraw(userSeat, totalGovernanceTokenSupply);

      // If we get here everything checked out and governance tokens were exchanged to the user
      totalGovernanceTokenSupply = AmountMath.subtract(totalGovernanceTokenSupply, withdrawResult.amount);

      userSeat.exit();
      return withdrawResult;
    }

    return zcf.makeInvitation(withdrawRewardsHook, "Withdraw rewards");
  }

  const observer = {
    updateState: updateTime => {
      Array.from(lockupsMap.entries()).map(
        async ([lockupId, lockupManager]) => {
          await lockupManager.notifyStateUpdate(updateTime);
        }
      )
    },

    fail: reason => {
      Array.from(lockupsMap.entries()).map(
        async ([lockupId, lockupManager]) => {
          await lockupManager.notifyFail(reason);
        }
      )
    },

    finish: done => {
      Array.from(lockupsMap.entries()).map(
        async ([lockupId, lockupManager]) => {
          await lockupManager.notifyFinish(done);
        }
      )
    }
  }

  observeNotifier(periodNotifier, observer);

  const { publication, subscription } = makeSubscriptionKit();

  const creatorObserver = {
    updateState: updateTime => {
      let state = {
        underLimit: false,
        verificationTime: updateTime,
        currentSupply: totalGovernanceTokenSupply.value
      }

      if (totalGovernanceTokenSupply.value < warnMinimumGovernanceTokenSupplyAmount.value) state.underLimit = true;

      publication.updateState(state);
    },
    fail: reason => {
      publication.fail(reason);
    },
    finish: done => {
      publication.finish(done);
    }
  }

  observeNotifier(periodNotifier, creatorObserver);

  const creatorFacet = Far('creator facet', {
    addSupportedIssuer,
    checkGovernanceTokenLiquidity: () => { return totalGovernanceTokenSupply.value },
    checkWarnMinimumGovernanceTokenSupply: () => { return warnMinimumGovernanceTokenSupplyAmount.value },
    getWarnGovernanceTokenSupplySubscription: () => { return subscription; },
    alterWarnMinimumGovernanceTokenSupply: (newValue) => {warnMinimumGovernanceTokenSupplyAmount = AmountMath.make(gTokenBrand, newValue)},
    makeAddRewardLiquidityInvitation: () => { return zcf.makeInvitation(addRewardLiquidity, "Add reward Liquidity") }
  });

  const publicFacet = Far('public facet', {
    getPolTokenIssuer: () => { return polIssuer},
    isIssuerSupported,
    makeLockupInvitation,
    makeUnlockInvitation,
    makeRedeemInvitation,
    makeWithdrawRewardsInvitation,
  });

  return harden({ creatorFacet, publicFacet, publicSubscribers: { subscription }});
}

harden(start);
export { start };
