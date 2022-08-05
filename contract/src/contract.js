// @ts-check
import '@agoric/zoe/exported.js';
import { AmountMath } from '@agoric/ertp';
import { lockupStrategies, rewardStrategyTypes } from './definitions';
import { checkTiers, checkLockupStrategy, checkRewardStrategyType, checkRewardStrategyStructure } from './verifiers';
import { Far } from '@endo/marshal';
import { makeScalarMap } from '@agoric/store';

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

  // TODO: Maybe use zcf.getIssuerForBrand(brand) to check if brand matches the issuer. Maybe another way ?
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

  const supportedIssuers = makeScalarMap('issuer');
  for (const issuer of initialSupportedIssuers) { // TODO: try to find a better way of doing this maybe?
    supportedIssuers.init(issuer, true);
  }

  const makeInvitation = (hook, hookName) => {
    return zcf.makeInvitation(hook, hookName);
  }

  const addSupportedIssuer = tokenIssuer => {
    assert(!supportedIssuers.has(tokenIssuer), `${tokenIssuer} is already supported`);
    supportedIssuers.init(tokenIssuer, true); // TODO: For now we use bools, maybe later we wil want some metadata
  }

  const addRewardLiquidity = (creatorSeat, offerArgs) => {};

  const lockupToken = async (userSeat, offerArgs) => {

    const timedLockup = async () => {};
    const beginUnlockLockup = async () => {};

    if (lockupStrategy === lockupStrategies.TIMED_LOCKUP) return await timedLockup();
    return await beginUnlockLockup();
  };

  const unlockToken = async (userSeat, offerArgs) => {

  };

  const withdraw = async (userSeat, offerArgs) => {

  };

  const creatorFacet = Far('creator facet', {
    addSupportedIssuer,
    makeAddRewardLiquidityInvitation: () => makeInvitation(addRewardLiquidity, "Add reward Liquidity")
  });

  const publicFacet = Far('public facet', {
    isIssuerSupported: issuerType => supportedIssuers.has(issuerType),
    makeLockupInvitation: () => makeInvitation(lockupToken, 'Token lockup'),
    makeUnlockInvitation: () => makeInvitation(unlockToken, 'Token unlock'),
    makeWithdrawInvitation: () => makeInvitation(withdraw, 'Withdraw tokens')
  });

  return harden({ creatorFacet, publicFacet });
}

harden(start);
export { start };
