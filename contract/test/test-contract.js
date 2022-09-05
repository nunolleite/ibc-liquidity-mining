// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';

import { E } from '@endo/far';

import { setupContract, initializeContract } from "./setup.js";
import { getAddRewardLiquiditySeat, getIssuer, getLockupSeat, getRedeemSeat, getUnlockSeat, getWithdrawSeat } from './helpers.js';
import { AmountMath, AssetKind } from '@agoric/ertp';
import { SECONDS_PER_DAY } from '../src/helpers.js';
import { lockupStrategies, rewardStrategyTypes } from '../src/definitions.js';

test('check correct initialization', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const {issuers, publicFacet } = await initializeContract(zoe, installation, timer);

  const { issuer: notSupportedIssuer} = getIssuer('Fake');

  const firstResponse = await E(publicFacet).isIssuerSupported(issuers.moola.issuer);
  const secondResponse = await E(publicFacet).isIssuerSupported(notSupportedIssuer);
  
  t.is(firstResponse, true);
  t.is(secondResponse, false);
})

test('able to add another supported issuer', async(t) => {
  const { zoe, installation, timer } = await setupContract();
  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, timer);

  const { issuer: issuerToSupport } = getIssuer('Supp');

  await E(creatorFacet).addSupportedIssuer(issuerToSupport);
  const response = await E(publicFacet).isIssuerSupported(issuerToSupport);

  t.is(response, true);
})

test('unable to add an already supported issuer', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, creatorFacet } = await initializeContract(zoe, installation, timer);

  await t.throwsAsync(E(creatorFacet).addSupportedIssuer(issuers.moola.issuer), {message: `Moola issuer is already supported`})
})

test('checks governance token liquidity', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { creatorFacet } = await initializeContract(zoe, installation, timer);

  const response = await E(creatorFacet).checkGovernanceTokenLiquidity();

  t.deepEqual(response, 0n);
})

test('adds governance token liquidity', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { governanceTokenKit, creatorFacet } = await initializeContract(zoe, installation, timer);
  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);

  const seat = await getAddRewardLiquiditySeat(zoe, creatorFacet, governanceTokenKit, governanceAmount);

  const message = await E(seat).getOfferResult();

  t.deepEqual(message, "Governance tokens liquidity increased by 10");

  const governanceTokenLiquidity = await E(creatorFacet).checkGovernanceTokenLiquidity();

  t.deepEqual(governanceTokenLiquidity, 10n);
})

test('locks with timed lockup', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, publicFacet } = await initializeContract(zoe, installation, timer);

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);

  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 1 });

  const message = await E(seat).getOfferResult();

  t.deepEqual(message.message, "Succeeded. Tokens locked.");
  t.truthy(message.publicSubscribers);
})

test('locks with a tier-based reward strategy', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, publicFacet } = await initializeContract(
    zoe,
    installation,
    timer,
    lockupStrategies.TIMED_LOCKUP,
    {
      type: rewardStrategyTypes.TIER,
      definition: [
        {
          timeAmount: 1,
          tokenAmount: 1
        },
        {
          timeAmount: 7,
          tokenAmount: 10
        },
        {
          timeAmount: 30,
          tokenAmount: 35
        }
      ]
    }
    )

    const polIssuer = await E(publicFacet).getPolTokenIssuer();
    const polBrand = polIssuer.getBrand();

    const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
    const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);

    const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 20 });

    const message = await E(seat).getOfferResult();

    t.deepEqual(message.message, "Succeeded. Tokens locked.");
    t.truthy(message.publicSubscribers);
})

test('locks with a custom reward strategy', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, publicFacet } = await initializeContract(
    zoe,
    installation,
    timer,
    lockupStrategies.TIMED_LOCKUP,
    {
      type: rewardStrategyTypes.CUSTOM,
      definition: (tokensLockedIn, timeLockedIn) => {return (tokensLockedIn * timeLockedIn * 2) - 1;}
    }
  )

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);

  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 20 });

  const message = await E(seat).getOfferResult();

  t.deepEqual(message.message, "Succeeded. Tokens locked.");
  t.truthy(message.publicSubscribers);
})

test('locks with the unlock strategy', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, publicFacet} = await initializeContract(zoe, installation, timer, lockupStrategies.UNLOCK);

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount);

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
  const { issuers, publicFacet } = await initializeContract(zoe, installation, timer, lockupStrategies.UNLOCK);

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount);

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

  const unlockSeat = await getUnlockSeat(zoe, publicFacet, polTokenAmount, polBrand, renewedPolTokenPayment, { unbondingPeriod: 1 });

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

test('does not allow unlock on a timed lockup contract', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, publicFacet } = await initializeContract(zoe, installation, timer);
  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 1 });

  const message = await E(seat).getOfferResult();

  t.deepEqual(message.message, "Succeeded. Tokens locked.");
  t.truthy(message.publicSubscribers);

  await t.throwsAsync(E(publicFacet).makeUnlockInvitation(), {message: 'This contract does not support the unlocking strategy'});
})

test('can withdraw rewards', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, creatorFacet, publicFacet, governanceTokenKit } = await initializeContract(zoe, installation, timer);

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 1 });

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);

  const addLiquiditySeat = await getAddRewardLiquiditySeat(zoe, creatorFacet, governanceTokenKit, governanceAmount);

  await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY) / 2);
  const renewedTokenPayment = await polIssuer.claim(payout, polTokenAmount);
  const withdrawalSeat = await getWithdrawSeat(zoe, publicFacet, polTokenAmount, governanceTokenKit.brand, 1n, renewedTokenPayment);

  const withdrawalMessage = await E(withdrawalSeat).getOfferResult();

  t.deepEqual(withdrawalMessage.message, 'Successfully collected governance tokens')

  const withdrawalPayout = await E(withdrawalSeat).getPayout('Governance');
  const amount = await (governanceTokenKit.issuer).getAmountOf(withdrawalPayout);

  t.deepEqual(amount.brand, governanceTokenKit.brand);
  t.deepEqual(amount.value, 1n);
})

test('cannot redeem without collecting rewards', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, creatorFacet, publicFacet, governanceTokenKit } = await initializeContract(zoe, installation, timer);

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 1 });

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);
  const addLiquiditySeat = await getAddRewardLiquiditySeat(zoe, creatorFacet, governanceTokenKit, governanceAmount);

  await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY * 2n));

  const renewedTokenPayment = await (polIssuer).claim(payout, polTokenAmount);
  const rSeat = await getRedeemSeat(zoe, publicFacet, polTokenAmount, moolaAmount, renewedTokenPayment);

  await t.throwsAsync(E(rSeat).getOfferResult(), {message: `Please collect all your rewards before redeeming your tokens, otherwise the rewards will be lost`});
})

test('cannot redeem without bonding period having passed', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, creatorFacet, publicFacet, governanceTokenKit } = await initializeContract(zoe, installation, timer);

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 1 });

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);
  const addLiquiditySeat = await getAddRewardLiquiditySeat(zoe, creatorFacet, governanceTokenKit, governanceAmount);
  await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY) / 2);

  const renewedTokenPayment = await (polIssuer).claim(payout, polTokenAmount);
  const rSeat = await getRedeemSeat(zoe, publicFacet, polTokenAmount, moolaAmount, renewedTokenPayment);

  await t.throwsAsync(E(rSeat).getOfferResult(), {message: `You are still in the bonding period. Cannot redeem tokens`});
})

test('cannot redeem with different locked in amount', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, creatorFacet, publicFacet, governanceTokenKit } = await initializeContract(zoe, installation, timer);

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 1 });

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);
  const addLiquiditySeat = await getAddRewardLiquiditySeat(zoe, creatorFacet, governanceTokenKit, governanceAmount);
  await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY * 2n));

  const renewedTokenPayment = await polIssuer.claim(payout, polTokenAmount);
  const withdrawalSeat = await getWithdrawSeat(zoe, publicFacet, polTokenAmount, governanceTokenKit.brand, 1n, renewedTokenPayment);

  const withdrawalMessage = await E(withdrawalSeat).getOfferResult();

  t.deepEqual(withdrawalMessage.message, 'Successfully collected governance tokens')

  const withdrawalTokenPayout = await E(withdrawalSeat).getPayout('WithdrawToken');
  const withdrawalTokenAmount = await E(polIssuer).getAmountOf(withdrawalTokenPayout);

  const newTokenPayment = await (polIssuer).claim(withdrawalTokenPayout, withdrawalTokenAmount);
  const rSeat = await getRedeemSeat(zoe, publicFacet, polTokenAmount, AmountMath.make(issuers.moola.brand, 6n), newTokenPayment);

  await t.throwsAsync(E(rSeat).getOfferResult(), {message: `The amount you are trying to redeem is diferent than the one locked in`});
})

test('can redeem', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, creatorFacet, publicFacet, governanceTokenKit } = await initializeContract(zoe, installation, timer);

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 1 });

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);
  const addLiquiditySeat = await getAddRewardLiquiditySeat(zoe, creatorFacet, governanceTokenKit, governanceAmount);
  await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY * 2n));

  const renewedTokenPayment = await polIssuer.claim(payout, polTokenAmount);
  const withdrawalSeat = await getWithdrawSeat(zoe, publicFacet, polTokenAmount, governanceTokenKit.brand, 1n, renewedTokenPayment);

  const withdrawalMessage = await E(withdrawalSeat).getOfferResult();

  t.deepEqual(withdrawalMessage.message, 'Successfully collected governance tokens')

  const withdrawalTokenPayout = await E(withdrawalSeat).getPayout('WithdrawToken');
  const withdrawalTokenAmount = await E(polIssuer).getAmountOf(withdrawalTokenPayout);
  const governanceTokenPayout = await E(withdrawalSeat).getPayout('Governance');
  const governanceTokenAmount = await E(governanceTokenKit.issuer).getAmountOf(governanceTokenPayout);

  t.deepEqual(governanceTokenAmount.brand, governanceTokenKit.brand);
  t.deepEqual(governanceTokenAmount.value, 2n);

  const newTokenPayment = await (polIssuer).claim(withdrawalTokenPayout, withdrawalTokenAmount);
  const rSeat = await getRedeemSeat(zoe, publicFacet, polTokenAmount, moolaAmount, newTokenPayment);

  const offerResult = await E(rSeat).getOfferResult();
  const tokenPayout = await E(rSeat).getPayout('LpTokens');
  const tokenAmount = await E(issuers.moola.issuer).getAmountOf(tokenPayout);

  t.deepEqual(tokenAmount.brand, issuers.moola.brand);
  t.deepEqual(tokenAmount.value, 5n);
  t.deepEqual(offerResult, "Tokens redeemed");
})

test('can withdraw rewards iteratively', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, creatorFacet, publicFacet, governanceTokenKit } = await initializeContract(zoe, installation, timer);

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 1 });

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 10n);
  const addLiquiditySeat = await getAddRewardLiquiditySeat(zoe, creatorFacet, governanceTokenKit, governanceAmount);
  await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY) / 2);
  const renewedTokenPayment = await polIssuer.claim(payout, polTokenAmount);
  const withdrawalSeat = await getWithdrawSeat(zoe, publicFacet, polTokenAmount, governanceTokenKit.brand, 1n, renewedTokenPayment);

  const withdrawalMessage = await E(withdrawalSeat).getOfferResult();

  t.deepEqual(withdrawalMessage.message, 'Successfully collected governance tokens')

  const withdrawalPayout = await E(withdrawalSeat).getPayout('Governance');
  const amount = await E(governanceTokenKit.issuer).getAmountOf(withdrawalPayout);
  const withdrawalTokenPayout = await E(withdrawalSeat).getPayout('WithdrawToken');
  const withdrawalTokenAmount = await E(polIssuer).getAmountOf(withdrawalTokenPayout);

  t.deepEqual(amount.brand, governanceTokenKit.brand);
  t.deepEqual(amount.value, 1n);

  await timer.tickN(Number(SECONDS_PER_DAY) / 2);

  const newTokenPayment = await polIssuer.claim(withdrawalTokenPayout, withdrawalTokenAmount);
  const newWithdrawalSeat = await getWithdrawSeat(zoe, publicFacet, polTokenAmount, governanceTokenKit.brand, 1n, newTokenPayment);

  const newWithdrawalMessage = await E(newWithdrawalSeat).getOfferResult();
  t.deepEqual(newWithdrawalMessage.message, 'Successfully collected governance tokens');

  const newWithdrawalPayout = await E(newWithdrawalSeat).getPayout('Governance');
  const newAmount = await E(governanceTokenKit.issuer).getAmountOf(newWithdrawalPayout);

  t.deepEqual(newAmount.brand, governanceTokenKit.brand);
  t.deepEqual(newAmount.value, 1n);
})

test('subscription notifies no rewards after lockup', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, publicFacet } = await initializeContract(zoe, installation, timer);

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 1 });

  const message = await E(seat).getOfferResult();

  t.deepEqual(message.message, "Succeeded. Tokens locked.");
  t.truthy(message.publicSubscribers);

  const { subscription } = message.publicSubscribers;

  const consume = async (subscription) => {
    const notifications = [];
    try {
      for await (const value of subscription) {
        notifications.push(value);
        break;
      }
    } catch (reason) {

    }

    return notifications;
  }

  await timer.tickN(Number(SECONDS_PER_DAY) / 12); // Advance 2H
  const notifications = await consume(subscription);
  
  t.is(notifications[0].expired, false);
  t.deepEqual(notifications[0].rewardsToCollect, 0);
  t.deepEqual(notifications[0].message, 'You currently have 0 governance tokens to collect.')
});

test('subscription notifies existent rewards after lockup', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, publicFacet } = await initializeContract(
    zoe,
    installation,
    timer,
    lockupStrategies.TIMED_LOCKUP,
    { type: rewardStrategyTypes.LINEAR, definition: 8 }
  );

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 5n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 1 });

  const message = await E(seat).getOfferResult();

  t.deepEqual(message.message, "Succeeded. Tokens locked.");
  t.truthy(message.publicSubscribers);

  const { subscription } = message.publicSubscribers;

  const consume = async (subscription) => {
    const notifications = [];
    try {
      for await (const value of subscription) {
        notifications.push(value);
        break;
      }
    } catch (reason) {

    }

    return notifications;
  }

  await timer.tickN(Number(SECONDS_PER_DAY) / 12); // Advance 2H
  const notifications = await consume(subscription);

  t.is(notifications[0].expired, false);
  t.deepEqual(notifications[0].rewardsToCollect, 1);
  t.deepEqual(notifications[0].message, 'You currently have 1 governance tokens to collect.');
})

test('withdraws rewards on a tier based strategy', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, creatorFacet, publicFacet, governanceTokenKit } = await initializeContract(
    zoe,
    installation,
    timer,
    lockupStrategies.TIMED_LOCKUP,
    {
      type: rewardStrategyTypes.TIER,
      definition: [
        {
          timeAmount: 1,
          tokenAmount: 1
        },
        {
          timeAmount: 7,
          tokenAmount: 10
        },
        {
          timeAmount: 30,
          tokenAmount: 35
        }
      ]
    }
  );

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 3n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 7 });

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 40n);

  const addLiquiditySeat = await getAddRewardLiquiditySeat(zoe, creatorFacet, governanceTokenKit, governanceAmount);

  await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY)); // Advance 1 day
  const renewedTokenPayment = await polIssuer.claim(payout, polTokenAmount);
  const withdrawalSeat = await getWithdrawSeat(zoe, publicFacet, polTokenAmount, governanceTokenKit.brand, 3n, renewedTokenPayment);

  const withdrawalMessage = await E(withdrawalSeat).getOfferResult();

  t.deepEqual(withdrawalMessage.message, 'Successfully collected governance tokens')

  const withdrawalPayout = await E(withdrawalSeat).getPayout('Governance');
  const amount = await (governanceTokenKit.issuer).getAmountOf(withdrawalPayout);
  const withdrawalTokenPayout = await E(withdrawalSeat).getPayout('WithdrawToken');
  const withdrawalTokenAmount = await E(polIssuer).getAmountOf(withdrawalTokenPayout);

  t.deepEqual(amount.brand, governanceTokenKit.brand);
  t.deepEqual(amount.value, 3n); // Amount of rewards to collect is 3n (tier value * locked amount = 1 * 3)

  await timer.tickN(Number(SECONDS_PER_DAY) * 6); // Advance 6 days

  const newTokenPayment = await polIssuer.claim(withdrawalTokenPayout, withdrawalTokenAmount);
  const newWithdrawalSeat = await getWithdrawSeat(zoe, publicFacet, polTokenAmount, governanceTokenKit.brand, 27n, newTokenPayment);

  const newWithdrawalMessage = await E(newWithdrawalSeat).getOfferResult();
  t.deepEqual(newWithdrawalMessage.message, 'Successfully collected governance tokens');

  const newWithdrawalPayout = await E(newWithdrawalSeat).getPayout('Governance');
  const newAmount = await E(governanceTokenKit.issuer).getAmountOf(newWithdrawalPayout);

  t.deepEqual(newAmount.brand, governanceTokenKit.brand);
  t.deepEqual(newAmount.value, 27n); // Amount of rewards to collect is 30n (tier value * locked amount = 10 * 3) minus rewards already collected (3n)
});

test('withdraws rewards on a custom strategy', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const { issuers, creatorFacet, publicFacet, governanceTokenKit } = await initializeContract(
    zoe,
    installation,
    timer,
    lockupStrategies.TIMED_LOCKUP,
    {
      type: rewardStrategyTypes.CUSTOM,
      definition: (tokensLockedIn, timeLockedIn) => {
        return tokensLockedIn * timeLockedIn - (tokensLockedIn - 1);
      }
    }
  );

  const polIssuer = await E(publicFacet).getPolTokenIssuer();
  const polBrand = polIssuer.getBrand();

  const moolaAmount = AmountMath.make(issuers.moola.brand, 3n);
  const polAmount = AmountMath.makeEmpty(polBrand, AssetKind.SET);
  
  const seat = await getLockupSeat(zoe, publicFacet, issuers.moola.mint, moolaAmount, polAmount, { bondingPeriod: 7 });

  const payout = await E(seat).getPayout('PolToken');
  const polTokenAmount = await E(polIssuer).getAmountOf(payout);

  const governanceAmount = AmountMath.make(governanceTokenKit.brand, 40n);

  const addLiquiditySeat = await getAddRewardLiquiditySeat(zoe, creatorFacet, governanceTokenKit, governanceAmount);

  await E(addLiquiditySeat).getOfferResult();

  await timer.tickN(Number(SECONDS_PER_DAY)); // Advance 1 day
  const renewedTokenPayment = await polIssuer.claim(payout, polTokenAmount);
  const withdrawalSeat = await getWithdrawSeat(zoe, publicFacet, polTokenAmount, governanceTokenKit.brand, 1n, renewedTokenPayment);

  const withdrawalMessage = await E(withdrawalSeat).getOfferResult();

  t.deepEqual(withdrawalMessage.message, 'Successfully collected governance tokens')

  const withdrawalPayout = await E(withdrawalSeat).getPayout('Governance');
  const amount = await (governanceTokenKit.issuer).getAmountOf(withdrawalPayout);
  const withdrawalTokenPayout = await E(withdrawalSeat).getPayout('WithdrawToken');
  const withdrawalTokenAmount = await E(polIssuer).getAmountOf(withdrawalTokenPayout);

  t.deepEqual(amount.brand, governanceTokenKit.brand);
  t.deepEqual(amount.value, 1n); // Amount of rewards to collect is the result of calling the method in definition

  await timer.tickN(Number(SECONDS_PER_DAY) * 6); // Advance 6 days

  // Rewards to collect should be (tokensLockedIn * timeLockedIn) - (tokensLockedIn - 1) - rewardsCollected => (3 * 7) - (3 - 1) - 1 => 18
  const newTokenPayment = await polIssuer.claim(withdrawalTokenPayout, withdrawalTokenAmount);
  const newWithdrawalSeat = await getWithdrawSeat(zoe, publicFacet, polTokenAmount, governanceTokenKit.brand, 18n, newTokenPayment);

  const newWithdrawalMessage = await E(newWithdrawalSeat).getOfferResult();
  t.deepEqual(newWithdrawalMessage.message, 'Successfully collected governance tokens');

  const newWithdrawalPayout = await E(newWithdrawalSeat).getPayout('Governance');
  const newAmount = await E(governanceTokenKit.issuer).getAmountOf(newWithdrawalPayout);

  t.deepEqual(newAmount.brand, governanceTokenKit.brand);
  t.deepEqual(newAmount.value, 18n);
});
