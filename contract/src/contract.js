// @ts-check
import '@agoric/zoe/exported.js';
import { assertProposalShape } from '@agoric/zoe/src/contractSupport/index.js';
import { AmountMath, AssetKind, makeIssuerKit } from '@agoric/ertp';
import { lockupStrategies, rewardStrategyTypes } from './definitions';
import { checkTiers, checkLockupStrategy, checkRewardStrategyType, checkRewardStrategyStructure } from './verifiers';
import { assertCopyArray, Far } from '@endo/marshal';
import { E } from '@endo/eventual-send';
import { makeScalarMap } from '@agoric/store';
import { getDaysInSeconds } from './helpers';

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
  const polMint = await zcf.makeZCFMint('polMint', AssetKind.SET);
  const { brand: polBrand } = polMint.getIssuerRecord();

  // TODO: Maybe we need to check if every issuer in initialSupportedIssuers is active in the AMM ?
  assert(checkLockupStrategy(lockupStrategy), `The given lockup strategy (${lockupStrategy}) is not supported`);
  assert(checkRewardStrategyStructure(rewardStrategy), `The given reward strategy object (${rewardStrategy}) is malformed. Has to have type and definition.`);
  const {
    type: rewardStrategyType,
    definition: rewardStrategyDefinition
  } = rewardStrategy;
  assert(checkRewardStrategyType(rewardStrategyType), `The given reward strategy type (${rewardStrategyType}) is not supported`);

  if (rewardStrategyType === rewardStrategyTypes.TIER) {
    assert(checkTiers(rewardStrategyDefinition), `Tiers for the reward strategy are malformed. Each has to have tokenAmount and timeAmount`);
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

  const makeInvitation = (hook, hookName) => {
    return zcf.makeInvitation(hook, hookName);
  }

  const addSupportedIssuer = async tokenIssuer => {
    const allegedBrand = zcf.getBrandForIssuer(tokenIssuer);
    assert(!supportedBrands.has(allegedBrand), `${tokenIssuer} is already supported`);

    const allegedIssuerName = await tokenIssuer.getAllegedName();
    await zcf.saveIssuer(tokenIssuer, allegedIssuerName);
    const certainBrand = zcf.getBrandForIssuer(tokenIssuer);
    supportedBrands.init(certainBrand, true); // TODO: For now we use bools, maybe later we wil want some metadata
  }

  const isIssuerSupported = issuer => {
    const brand = zcf.getBrandForIssuer(issuer);
    if (supportedBrands.has(brand)) return true;
    return false;
  }

  const addRewardLiquidity = (creatorSeat, offerArgs) => {
    assertProposalShape(creatorSeat, {
      give: {Governance: null}
    });

    const { give: {Governance: gTokenAmount}} = creatorSeat.getProposal();

    totalGovernanceTokenSupply = AmountMath.add(totalGovernanceTokenSupply, gTokenAmount);

    zcfSeat.incrementBy(
      creatorSeat.decrementBy(harden({Governance: gTokenAmount}))
    );

    zcf.reallocate(zcfSeat, creatorSeat);
    creatorSeat.exit();

    return "Governance token liquidity increased" 
  };

  const lockupToken = async (userSeat, offerArgs) => {

    const beginTimedLockup = async (lpTokensAmount, offerProps) => {
      assert(typeof offerProps === 'object', 'NO OFFER ARGUMENTS PRESENT');
      assert(offerProps.hasOwnProperty('bondingPeriod'), `NO OFFER ARGUMENTS PRESENT`);
      const bondingPeriod = offerProps.bondingPeriod;

      const newPolTokenAmount = AmountMath.make(polBrand, [{
        amountLockedIn: lpTokensAmount.value,
        brandLockedIn: lpTokensAmount.brand,
        bondingPeriod: bondingPeriod,
        lockingTimestamp: await E(timerService).getCurrentTimestamp()
      }]);

      polMint.mintGains(harden({PolToken: newPolTokenAmount}), zcfSeat);

      zcfSeat.incrementBy(
        userSeat.decrementBy(harden({ LpTokens: lpTokensAmount }))
      );
      userSeat.incrementBy(
        zcfSeat.decrementBy(harden({ PolToken: newPolTokenAmount }))
      );

      zcf.reallocate(zcfSeat, userSeat);
      userSeat.exit();

      return "Tokens locked"; // TODO: We need to somehow return a notifier which warns of rewards
    };

    const beginUnlockLockup = async lpTokensAmount => {
      const newPolTokenAmount = AmountMath.make(polBrand, [{
        amountLockedIn: lpTokensAmount.value,
        brandLockedIn: lpTokensAmount.brand,
        lockingTimestamp: await E(timerService).getCurrentTimestamp()
      }]);

      polMint.mintGains(harden({PolToken: newPolTokenAmount}), zcfSeat);

      zcfSeat.incrementBy(
        userSeat.decrementBy(harden({ LpTokens: lpTokensAmount }))
      );
      userSeat.incrementBy(
        zcfSeat.decrementBy(harden({ PolToken: newPolTokenAmount }))
      );

      zcf.reallocate(zcfSeat, userSeat);
      userSeat.exit()

      return "Tokens locked"; // TODO: we need to somehow return a notifier which warns of rewards
    };

    assertProposalShape(userSeat, {
      give: {LpTokens: null},
      want: {PolToken: null}
    })

    const { give: { LpTokens: lpTokensAmount}} = userSeat.getProposal();
    const { brand } = lpTokensAmount;
    assert(supportedBrands.has(brand), `The brand ${brand} is not supported`);


    if (lockupStrategy === lockupStrategies.TIMED_LOCKUP) return await beginTimedLockup(lpTokensAmount, offerArgs);
    return await beginUnlockLockup(lpTokensAmount);
  };

  const unlockToken = async (userSeat, offerArgs) => {
    let unbondingPeriod = offerArgs.unbondingPeriod;
    if(!unbondingPeriod) unbondingPeriod = 1;

    assertProposalShape(userSeat, {
      give: {PolToken: null},
      want: {UnbondingToken: null}
    })

    const { give: {PolToken: polTokenAmount}} = userSeat.getProposal();
    const polToken = polTokenAmount.value[0]; // Is this how we access the object inside, just as normal array?

    const newUnbondingTokenAmount = AmountMath.make(polBrand, [{
      amountLockedIn: polToken.amountLockedIn,
      brandLockedIn: polToken.brandLockedIn,
      unbondingPeriod: unbondingPeriod,
      initialTimestamp: polToken.lockingTimestamp,
      unbondingTimestamp: await E(timerService).getCurrentTimestamp(),
    }]);

    polMint.mintGains(harden({UnbondingToken: newUnbondingTokenAmount}), zcfSeat);

    userSeat.incrementBy(
      zcfSeat.decrementBy(harden({UnbondingToken: newUnbondingTokenAmount}))
    )
    zcfSeat.incrementBy(
      userSeat.decrementBy(harden({PolToken: polTokenAmount}))
    );
    zcf.reallocate(zcfSeat, userSeat);

    // TODO: should we burn the PolToken?

    userSeat.exit();
    return "Unlocking operation successful" // TODO: We should return a new notifier for this to warn the user of new rewards and when the unbonding period is done
  };

  const withdraw = async (userSeat, offerArgs) => {
    // What most likely with this method is (two possible options):
    // 1 - User Wants governance tokens (the amount sent in the message) and Gives the Lockup NFT
    //  Here we need to check if it is an antipatter putting the NFT in the Give but not actually exchanging it
    // 2 - If we need to exchange the NFT we add a new metadata field which holds the amount of days whose rewards have already been withdrawn

  };

  const redeem = async (userSeat, offerArgs) => {
    assertProposalShape(userSeat, {
      give: { RedeemToken: null }, // RedeemToken is one of PolToken or UnbondingToken given before
      want: { LpTokens: null },
    })

    const {give: { RedeemToken: redeemTokenAmount }, want: { LpTokens: lpTokensAmount }} = userSeat.getProposal();
    const redeemToken = redeemTokenAmount.value[0];
    if (redeemToken.unbondingPeriod) {
      const unbondingPeriodInSeconds = getDaysInSeconds(redeemToken.unbondingPeriod);
      const currentTimestamp = await E(timerService).getCurrentTimestamp();

      assert(redeemToken.unbondingTimestamp + unbondingPeriodInSeconds <= currentTimestamp, `You are still in the unbonding period. Cannot redeem the LP tokens yet`);
    }
    // TODO: Check if any rewards are left to hand out
    assert(lpTokensAmount.value === redeemToken.amountLockedIn, `The amount wanted is not the same as the amount locked in`);
    assert(lpTokensAmount.brand === redeemToken.brandLockedIn, `The brand of the amount wanted is not the same as the brand locked in`);

    userSeat.incrementBy(
      zcfSeat.decrementBy(harden({LpTokens: lpTokensAmount}))
    )
    zcfSeat.incrementBy(
      userSeat.decrementBy(harden({ReddemToken: redeemTokenAmount}))
    )
    zcf.reallocate(zcfSeat, userSeat);
    // TODO: Should we burn the redeem token?
    userSeat.exit();
    return "Success. Your LP tokens are redeemed";
  }

  const creatorFacet = Far('creator facet', {
    addSupportedIssuer,
    checkGovernanceTokenLiquidity: () => {return totalGovernanceTokenSupply.value},
    makeAddRewardLiquidityInvitation: () => makeInvitation(addRewardLiquidity, "Add reward Liquidity")
  });

  const publicFacet = Far('public facet', {
    isIssuerSupported,
    makeLockupInvitation: () => makeInvitation(lockupToken, 'Token lockup'),
    makeUnlockInvitation: () => makeInvitation(unlockToken, 'Token unlock'),
    makeRedeemInvitation: () => makeInvitation(redeem, "Redeem tokens"),
    makeWithdrawInvitation: () => makeInvitation(withdraw, 'Withdraw tokens')
  });

  return harden({ creatorFacet, publicFacet });
}

harden(start);
export { start };
