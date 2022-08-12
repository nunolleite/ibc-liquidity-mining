// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';

import { E } from '@endo/eventual-send';
import { lockupStrategies, rewardStrategyTypes } from '../src/definitions.js';

import {setupContract, initializeContract } from "./setup.js";
import {getInitialSupportedIssuers, getGovernanceTokenKit, getIssuer} from './helpers.js';
import { AmountMath, AssetKind } from '@agoric/ertp';
import { SECONDS_PER_DAY } from '../src/helpers.js';

test('check correct initialization', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });

  const { issuer: notSupportedIssuer} = getIssuer('Fake');

  const firstResponse = await E(publicFacet).isIssuerSupported(issuers.moola.issuer);
  const secondResponse = await E(publicFacet).isIssuerSupported(notSupportedIssuer);
  
  t.is(firstResponse, true);
  t.is(secondResponse, false);
})

test('able to add another supported issuer', async(t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });

  const { issuer: issuerToSupport } = getIssuer('Supp');

  await E(creatorFacet).addSupportedIssuer(issuerToSupport);
  const response = await E(publicFacet).isIssuerSupported(issuerToSupport);

  t.is(response, true);
})

test('unable to add an already supported issuer', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });

  await t.throwsAsync(E(creatorFacet).addSupportedIssuer(issuers.moola.issuer), {message: `Moola issuer is already supported`})
})

test('checks governance token liquidity', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });

  const response = await E(creatorFacet).checkGovernanceTokenLiquidity();

  t.deepEqual(response, 0n);
})

test('adds governance token liquidity', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  });

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });
  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);

  const proposal = harden({ give: { Governance: governanceAmount}});
  const paymentKeywordRecord = harden({ Governance: governanceTokenKit.mint.mintPayment(governanceAmount) });
  const invitation = await E(creatorFacet).makeAddRewardLiquidityInvitation();

  const seat = await E(zoe).offer(
    invitation,
    proposal,
    paymentKeywordRecord
  );

  const message = await E(seat).getOfferResult();

  t.deepEqual(message, "Governance tokens liquidity increased by 10");

  const governanceTokenLiquidity = await E(creatorFacet).checkGovernanceTokenLiquidity();

  t.deepEqual(governanceTokenLiquidity, 10n);
})

test('locks with timed lockup', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });
  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const proposal = { give: { LpTokens: moolaAmount}, want: {PolToken: polAmount}};
  const paymentKeywordRecord = harden({ LpTokens: issuers.moola.mint.mintPayment(moolaAmount)});
  const invitation = await E(publicFacet).makeLockupInvitation();

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord, {bondingPeriod: 1})

  const message = await E(seat).getOfferResult();

  t.deepEqual(message.message, "Succeeded. Tokens locked.");
  t.truthy(message.publicSubscribers);
})

test('locks with the unlock strategy', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.UNLOCK,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });
  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const proposal = { give: { LpTokens: moolaAmount}, want: {PolToken: polAmount}};
  const paymentKeywordRecord = harden({ LpTokens: issuers.moola.mint.mintPayment(moolaAmount)});
  const invitation = await E(publicFacet).makeLockupInvitation();

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord)

  const message = await E(seat).getOfferResult();

  const payout = await E(seat).getPayout('PolToken');
  const polToken = (await E(polIssuer).getAmountOf(payout)).value[0];
  
  t.deepEqual(polToken.amountLockedIn, 5n);
  t.deepEqual(polToken.lockupId, '1');
  t.deepEqual(message.message, "Succeeded. Tokens locked.");
  t.truthy(message.publicSubscribers);
})

test('starts unbonding on an unlock strategy', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.UNLOCK,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });
  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const proposal = { give: { LpTokens: moolaAmount}, want: {PolToken: polAmount}};
  const paymentKeywordRecord = harden({ LpTokens: issuers.moola.mint.mintPayment(moolaAmount)});
  const invitation = await E(publicFacet).makeLockupInvitation();

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord)

  const message = await E(seat).getOfferResult();

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);
  const polToken = polTokenAmount.value[0];

  t.deepEqual(polToken.amountLockedIn, 5n);
  t.deepEqual(polToken.lockupId, '1');
  t.deepEqual(message.message, "Succeeded. Tokens locked.");
  t.truthy(message.publicSubscribers);

  await timer.tick();

  const renewedPolTokenPayment = await polIssuer.claim(payout, polTokenAmount);
  const unlockProposal = { give: {PolToken: polTokenAmount}, want: {UnbondingToken: AmountMath.makeEmpty(polBrand, AssetKind.SET)}};
  const unlockPaymentKeywordRecord = harden({ PolToken: renewedPolTokenPayment});
  const unlockInvitation = await E(publicFacet).makeUnlockInvitation();

  const unlockSeat = await E(zoe).offer(unlockInvitation, unlockProposal, unlockPaymentKeywordRecord, {unbondingPeriod: 1});

  const unlockMessage = await E(unlockSeat).getOfferResult();

  const unlockPayout = await E(unlockSeat).getPayout('UnbondingToken');
  const unbondingTokenAmount = await E(polIssuer).getAmountOf(unlockPayout);
  const unbondingToken = unbondingTokenAmount.value[0];

  t.deepEqual(unbondingToken.amountLockedIn, 5n);
  t.deepEqual(unbondingToken.lockupId, '1');
  t.deepEqual(unbondingToken.unbondingPeriod, 1);
  t.deepEqual(unbondingToken.unbondingTimestamp, 1n); // time has to have ticked to 1
  t.deepEqual(unlockMessage.message, "Unlock operation succeeded");
  t.truthy(unlockMessage.publicSubscribers);

})

test('does not allow unlock on a timed lockup', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });
  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const proposal = { give: { LpTokens: moolaAmount}, want: {PolToken: polAmount}};
  const paymentKeywordRecord = harden({ LpTokens: issuers.moola.mint.mintPayment(moolaAmount)});
  const invitation = await E(publicFacet).makeLockupInvitation();

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord, {bondingPeriod: 1})

  const message = await E(seat).getOfferResult();

  t.deepEqual(message.message, "Succeeded. Tokens locked.");
  t.truthy(message.publicSubscribers);

  await t.throwsAsync(E(publicFacet).makeUnlockInvitation(), {message: 'This contract does not support the unlocking strategy'});
})

test('can withdraw rewards', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });
  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const proposal = { give: { LpTokens: moolaAmount}, want: {PolToken: polAmount}};
  const paymentKeywordRecord = harden({ LpTokens: issuers.moola.mint.mintPayment(moolaAmount)});
  const invitation = await E(publicFacet).makeLockupInvitation();

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord, {bondingPeriod: 1})

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);
  const addLiquidityProposal = harden({ give: { Governance: governanceAmount}});
  const addLiquidityPaymentKeywordRecord = harden({ Governance: governanceTokenKit.mint.mintPayment(governanceAmount) });
  const addLiquidityInvitation = await E(creatorFacet).makeAddRewardLiquidityInvitation();

  const addLiquiditySeat = await E(zoe).offer(
    addLiquidityInvitation,
    addLiquidityProposal,
    addLiquidityPaymentKeywordRecord
  );

  const addLiquidityMessage = await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY) / 2);
  const renewedTokenPayment = await polIssuer.claim(payout, polTokenAmount);
  const withdrawalProposal = { give: { WithdrawToken: polTokenAmount }, want: { Governance: AmountMath.make(governanceTokenKit.brand, 1n)}};
  const withdrawalPaymentKeywordRecord = harden({ WithdrawToken: renewedTokenPayment });
  const withdrawalInvitation = await E(publicFacet).makeWithdrawRewardsInvitation();

  const withdrawalSeat = await E(zoe).offer(withdrawalInvitation, withdrawalProposal, withdrawalPaymentKeywordRecord);

  const withdrawalMessage = await E(withdrawalSeat).getOfferResult();

  t.deepEqual(withdrawalMessage.message, 'Successfully collected governance tokens')

  const withdrawalPayout = await E(withdrawalSeat).getPayout('Governance');
  const amount = await (governanceTokenKit.issuer).getAmountOf(withdrawalPayout);

  t.deepEqual(amount.brand, governanceTokenKit.brand);
  t.deepEqual(amount.value, 1n);
})

test('cannot redeem without collecting rewards', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });
  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const proposal = { give: { LpTokens: moolaAmount}, want: {PolToken: polAmount}};
  const paymentKeywordRecord = harden({ LpTokens: issuers.moola.mint.mintPayment(moolaAmount)});
  const invitation = await E(publicFacet).makeLockupInvitation();

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord, {bondingPeriod: 1})

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);
  const addLiquidityProposal = harden({ give: { Governance: governanceAmount}});
  const addLiquidityPaymentKeywordRecord = harden({ Governance: governanceTokenKit.mint.mintPayment(governanceAmount) });
  const addLiquidityInvitation = await E(creatorFacet).makeAddRewardLiquidityInvitation();

  const addLiquiditySeat = await E(zoe).offer(
    addLiquidityInvitation,
    addLiquidityProposal,
    addLiquidityPaymentKeywordRecord
  );

  const addLiquidityMessage = await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY * 2n));

  const renewedTokenPayment = await (polIssuer).claim(payout, polTokenAmount);
  const redeemProposal = { give: { RedeemToken: polTokenAmount }, want: { LpTokens: moolaAmount }};
  const redeemPayment = harden({ RedeemToken: renewedTokenPayment });
  const redeemInvitation = await E(publicFacet).makeRedeemInvitation();

  const rSeat = await E(zoe).offer(redeemInvitation, redeemProposal, redeemPayment);

  await t.throwsAsync(E(rSeat).getOfferResult(), {message: `Please collect all your rewards before redeeming your tokens, otherwise the rewards will be lost`});
})

test('cannot redeem without bonding period having passed', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });
  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const proposal = { give: { LpTokens: moolaAmount}, want: {PolToken: polAmount}};
  const paymentKeywordRecord = harden({ LpTokens: issuers.moola.mint.mintPayment(moolaAmount)});
  const invitation = await E(publicFacet).makeLockupInvitation();

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord, {bondingPeriod: 1})

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);
  const addLiquidityProposal = harden({ give: { Governance: governanceAmount}});
  const addLiquidityPaymentKeywordRecord = harden({ Governance: governanceTokenKit.mint.mintPayment(governanceAmount) });
  const addLiquidityInvitation = await E(creatorFacet).makeAddRewardLiquidityInvitation();

  const addLiquiditySeat = await E(zoe).offer(
    addLiquidityInvitation,
    addLiquidityProposal,
    addLiquidityPaymentKeywordRecord
  );

  const addLiquidityMessage = await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY) / 2);

  const renewedTokenPayment = await (polIssuer).claim(payout, polTokenAmount);
  const redeemProposal = { give: { RedeemToken: polTokenAmount }, want: { LpTokens: moolaAmount }};
  const redeemPayment = harden({ RedeemToken: renewedTokenPayment });
  const redeemInvitation = await E(publicFacet).makeRedeemInvitation();

  const rSeat = await E(zoe).offer(redeemInvitation, redeemProposal, redeemPayment);

  await t.throwsAsync(E(rSeat).getOfferResult(), {message: `You are still in the bonding period. Cannot redeem tokens`});
})

test('cannot redeem with different locked in amount', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });
  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const proposal = { give: { LpTokens: moolaAmount}, want: {PolToken: polAmount}};
  const paymentKeywordRecord = harden({ LpTokens: issuers.moola.mint.mintPayment(moolaAmount)});
  const invitation = await E(publicFacet).makeLockupInvitation();

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord, {bondingPeriod: 1})

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);
  const addLiquidityProposal = harden({ give: { Governance: governanceAmount}});
  const addLiquidityPaymentKeywordRecord = harden({ Governance: governanceTokenKit.mint.mintPayment(governanceAmount) });
  const addLiquidityInvitation = await E(creatorFacet).makeAddRewardLiquidityInvitation();

  const addLiquiditySeat = await E(zoe).offer(
    addLiquidityInvitation,
    addLiquidityProposal,
    addLiquidityPaymentKeywordRecord
  );

  const addLiquidityMessage = await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY * 2n));

  const renewedTokenPayment = await polIssuer.claim(payout, polTokenAmount);
  const withdrawalProposal = { give: { WithdrawToken: polTokenAmount }, want: { Governance: AmountMath.make(governanceTokenKit.brand, 1n)}};
  const withdrawalPaymentKeywordRecord = harden({ WithdrawToken: renewedTokenPayment });
  const withdrawalInvitation = await E(publicFacet).makeWithdrawRewardsInvitation();

  const withdrawalSeat = await E(zoe).offer(withdrawalInvitation, withdrawalProposal, withdrawalPaymentKeywordRecord);

  const withdrawalMessage = await E(withdrawalSeat).getOfferResult();

  t.deepEqual(withdrawalMessage.message, 'Successfully collected governance tokens')

  const withdrawalTokenPayout = await E(withdrawalSeat).getPayout('WithdrawToken');
  const withdrawalTokenAmount = await E(polIssuer).getAmountOf(withdrawalTokenPayout);

  const newTokenPayment = await (polIssuer).claim(withdrawalTokenPayout, withdrawalTokenAmount);
  const redeemProposal = { give: { RedeemToken: polTokenAmount }, want: { LpTokens: AmountMath.make(issuers.moola.brand, 6n)}};
  const redeemPayment = harden({ RedeemToken: newTokenPayment });
  const redeemInvitation = await E(publicFacet).makeRedeemInvitation();

  const rSeat = await E(zoe).offer(redeemInvitation, redeemProposal, redeemPayment);

  await t.throwsAsync(E(rSeat).getOfferResult(), {message: `The amount you are trying to redeem is diferent than the one locked in`});
})

test('can redeem', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
  const governanceTokenKit = getGovernanceTokenKit();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: initialIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand: governanceTokenKit.brand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms, { Governance: governanceTokenKit.issuer });
  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const proposal = { give: { LpTokens: moolaAmount}, want: {PolToken: polAmount}};
  const paymentKeywordRecord = harden({ LpTokens: issuers.moola.mint.mintPayment(moolaAmount)});
  const invitation = await E(publicFacet).makeLockupInvitation();

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord, {bondingPeriod: 1})

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);
  const addLiquidityProposal = harden({ give: { Governance: governanceAmount}});
  const addLiquidityPaymentKeywordRecord = harden({ Governance: governanceTokenKit.mint.mintPayment(governanceAmount) });
  const addLiquidityInvitation = await E(creatorFacet).makeAddRewardLiquidityInvitation();

  const addLiquiditySeat = await E(zoe).offer(
    addLiquidityInvitation,
    addLiquidityProposal,
    addLiquidityPaymentKeywordRecord
  );

  const addLiquidityMessage = await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY * 2n));

  const renewedTokenPayment = await polIssuer.claim(payout, polTokenAmount);
  const withdrawalProposal = { give: { WithdrawToken: polTokenAmount }, want: { Governance: AmountMath.make(governanceTokenKit.brand, 1n)}};
  const withdrawalPaymentKeywordRecord = harden({ WithdrawToken: renewedTokenPayment });
  const withdrawalInvitation = await E(publicFacet).makeWithdrawRewardsInvitation();

  const withdrawalSeat = await E(zoe).offer(withdrawalInvitation, withdrawalProposal, withdrawalPaymentKeywordRecord);

  const withdrawalMessage = await E(withdrawalSeat).getOfferResult();

  t.deepEqual(withdrawalMessage.message, 'Successfully collected governance tokens')

  const withdrawalTokenPayout = await E(withdrawalSeat).getPayout('WithdrawToken');
  const withdrawalTokenAmount = await E(polIssuer).getAmountOf(withdrawalTokenPayout);
  const governanceTokenPayout = await E(withdrawalSeat).getPayout('Governance');
  const governanceTokenAmount = await E(governanceTokenKit.issuer).getAmountOf(governanceTokenPayout);

  t.deepEqual(governanceTokenAmount.brand, governanceTokenKit.brand);
  t.deepEqual(governanceTokenAmount.value, 2n);

  const newTokenPayment = await (polIssuer).claim(withdrawalTokenPayout, withdrawalTokenAmount);
  const redeemProposal = { give: { RedeemToken: polTokenAmount }, want: { LpTokens: moolaAmount}};
  const redeemPayment = harden({ RedeemToken: newTokenPayment });
  const redeemInvitation = await E(publicFacet).makeRedeemInvitation();

  const rSeat = await E(zoe).offer(redeemInvitation, redeemProposal, redeemPayment);

  const offerResult = await E(rSeat).getOfferResult();
  const tokenPayout = await E(rSeat).getPayout('LpTokens');
  const tokenAmount = await E(issuers.moola.issuer).getAmountOf(tokenPayout);

  t.deepEqual(tokenAmount.brand, issuers.moola.brand);
  t.deepEqual(tokenAmount.value, 5n);
  t.deepEqual(offerResult, "Tokens redeemed");
})

// TODO: Test the subscribers
