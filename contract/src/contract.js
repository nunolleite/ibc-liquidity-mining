// @ts-check
import '@agoric/zoe/exported.js';
import { assertProposalShape } from '@agoric/zoe/src/contractSupport/index.js';
import { AmountMath, AssetKind } from '@agoric/ertp';
import { lockupStrategies, rewardStrategyTypes } from './definitions';
import { checkTiers, checkLockupStrategy, checkRewardStrategyType, checkRewardStrategyStructure } from './verifiers';
import { Far } from '@endo/marshal';
import { E } from '@endo/eventual-send';
import { makeScalarMap } from '@agoric/store';
import { makeLockupManager } from './lockupManager';
import { observeNotifier } from '@agoric/notifier';
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
    gTokenBrand
  } = zcf.getTerms();

  const { zcfSeat } = zcf.makeEmptySeatKit();
  let totalGovernanceTokenSupply = AmountMath.makeEmpty(gTokenBrand, 'nat');
  const polMint = await zcf.makeZCFMint('PolMint', AssetKind.SET);
  let lockupCounter = 1;
  const lockupsMap = makeScalarMap('lockups');
  const { brand: polBrand } = polMint.getIssuerRecord();
  const periodNotifier = await E(timerService).makeNotifier(0n, SECONDS_PER_HOUR);

  // TODO: Maybe we need to check if every issuer in initialSupportedIssuers is active in the AMM ?
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
    try {
      const allegedBrand = zcf.getBrandForIssuer(tokenIssuer);
      assert(!supportedBrands.has(allegedBrand), `${tokenIssuer} is already supported`);
    } catch (e) {
      // Issuer is not yet supported
      const allegedIssuerName = await tokenIssuer.getAllegedName();
      await zcf.saveIssuer(tokenIssuer, allegedIssuerName);
      const certainBrand = zcf.getBrandForIssuer(tokenIssuer);
      supportedBrands.init(certainBrand, true); // TODO: For now we use bools, maybe later we wil want some metadata
    }
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

    return "Governance token liquidity increased"
  };

  /**
   * 
   * @returns {Promise<Invitation>}
   */
  const makeLockupInvitation = () => {

    const lockupHook = (userSeat, offerArgs) => {
      assertProposalShape(userSeat, {
        give: { LpTokens: null },
        want: { PolToken: null }
      })

      const { give: { LPTokens: lpTokensAmount } } = userSeat.getProposal();
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
      const lockupResult = lockupManager.lockup(userSeat, offerArgs);
      lockupsMap.init(lockupCounter, lockupManager);
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

    const unlockHook = (userSeat, offerArgs) => {
      assertProposalShape(userSeat, {
        give: { PolToken: null },
        want: { UnbondingToken: null }
      })

      const { give: { PolToken: polTokenAmount } } = userSeat.getProposal();
      const lockupManager = lockupsMap.get(polTokenAmount.value[0].lockupId);
      const unlockResult = lockupManager.unlock(userSeat, offerArgs);

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

    const redeemHook = (userSeat) => {
      assertProposalShape(userSeat, {
        give: { RedeemToken: null }, // RedeemToken is one of PolToken or UnbondingToken given before
        want: { LpTokens: null },
      });

      const { give: { RedeemToken: redeemTokenAmount } } = userSeat.getProposal();
      const lockupManager = lockupsMap.get(redeemTokenAmount.value[0].lockupId);
      const redeemResult = lockupManager.redeem(userSeat);

      userSeat.exit();
      return redeemResult;
    }

    return zcf.makeInvitation(redeemHook, 'Redeem');
  }

  /**
   * 
   * @returns {Promise<Invitation>}
   */
  const makeWithdrawRewardsInvitation = () => {

    const withdrawRewardsHook = (userSeat) => {
      assertProposalShape(userSeat, {
        give: { WithdrawToken: null },
        want: { Governance: null }
      });

      const { give: { WithdrawToken: withdrawTokenAmount } } = userSeat.getProposal();
      const lockupManager = lockupsMap.get(withdrawTokenAmount.value[0].lockupId);
      const withdrawResult = lockupManager.withdraw(userSeat);

      userSeat.exit();
      return withdrawResult;
    }

    return zcf.makeInvitation(withdrawRewardsHook, "Withdraw rewards");
  }



  const creatorFacet = Far('creator facet', {
    addSupportedIssuer,
    checkGovernanceTokenLiquidity: () => { return totalGovernanceTokenSupply.value },
    makeAddRewardLiquidityInvitation: () => { return zcf.makeInvitation(addRewardLiquidity, "Add reward Liquidity") }
  });

  const publicFacet = Far('public facet', {
    isIssuerSupported,
    makeLockupInvitation,
    makeUnlockInvitation,
    makeRedeemInvitation,
    makeWithdrawRewardsInvitation
  });

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

  return harden({ creatorFacet, publicFacet });
}

harden(start);
export { start };
