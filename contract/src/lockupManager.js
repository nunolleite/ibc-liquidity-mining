import { AmountMath } from "@agoric/ertp";
import { makeSubscriptionKit, observeNotifier } from "@agoric/notifier";
import { E } from "@endo/eventual-send";
import { Far } from "@endo/marshal";
import { lockupStrategies } from "./definitions";
import { daysToSeconds } from "./helpers";

export const makeLockupManager = (
    zcf,
    zcfSeat,
    lockupId,
    lockupStrategy,
    rewardStrategyType,
    rewardStrategyValue,
    periodNotifier,
    timerService,
    polBrand,
    polMint,
    gTokenBrand,
    amountLockedIn
) => {
    let lockupPublication = null;
    let rewardsCollected = 0.0;

    const checkLockupState = (polTokenInformation, currentTimestamp) => {};

    const lockup = async (userSeat, offerArgs) => {
        const { brand, value } = amountLockedIn;
        const polTokenAmountValue = {
            lockupId,
            amountLockedIn: value,
            brandLockedIn: brand,
            lockingTimestamp: await E(timeService).getCurrentTimestamp()
        }
        if (lockupStrategy === lockupStrategies.TIMED_LOCKUP) {
            assert(typeof offerArgs === 'object', 'NO OFFER ARGUMENTS PRESENT');
            assert(offerArgs.hasOwnProperty('bondingPeriod'), 'NO OFFER ARGUMENTS PRESENT');
            polTokenAmountValue.bondingPeriod = offerArgs.bondingPeriod;
        }

        const newPolTokenAmount = AmountMath.make(polBrand, [polTokenAmountValue]);
        polMint.mintGains(harden({ PolToken: newPolTokenAmount}), zcfSeat);

        zcfSeat.incrementBy(
            userSeat.decrementBy(harden({ LpTokens: amountLockedIn }))
        );

        userSeat.incrementBy(
            zcfSeat.decrementBy(harden({ PolToken: newPolTokenAmount }))
        );

        zcf.reallocate(zcfSeat, userSeat);

        const { publication, subscription } = makeSubscriptionKit();
        lockupPublication = publication;

        const observer = {
            updateState: updateTime => {
                const lockupState = checkLockupState(polTokenAmountValue, updateTime);
                lockupPublication.updateState(lockupState);
            },

            fail: reason => {
                lockupPublication.fail(reason);
            },

            finish: done => {
                lockupPublication.finish(done);
            }
        }

        observeNotifier(periodNotifier, observer);

        return harden({message: "Succeeded. Tokens locked.", publicSubscribers: {subscription}});
    };

    const unlock = async (userSeat, offerArgs) => {
        const unbondingPeriod = offerArgs.unbondingPeriod ? offerArgs.unbondingPeriod : 1;

        const { give: { PolToken: polTokenAmount }} = userSeat.getProposal();
        const polToken = polTokenAmount.value[0];
        const currentTimestamp = await E(timeService).getCurrentTimestamp();

        const newUnbondingTokenAmount = AmountMath.make(polBrand, [{
            ...polToken,
            unbondingPeriod,
            unbondingTimestamp: currentTimestamp
        }]);

        polMint.mintGains(harden({ UnbondingToken: newUnbondingTokenAmount }), zcfSeat);

        userSeat.incrementBy(
            zcfSeat.decrementBy(harden({ UnbondingToken: newUnbondingTokenAmount }))
        )

        zcfSeat.incrementBy(
            userSeat.decrementBy(harden({ PolToken: polTokenAmount }))
        )

        zcf.reallocate(zcfSeat, userSeat);

        // NOTE: Should we burn the polToken since it won't be used anymore ?

        const { publication, subscription } = makeSubscriptionKit();

        lockupPublication.finish({message: "Unbonding has started", unbondingTimestamp: currentTimestamp});
        lockupPublication = publication;

        // TODO: Remove the previous observer

        const observer = {
            updateState: updateTime => {
                const unlockState = checkLockupState(newUnbondingTokenAmount.value[0], updateTime);
                lockupPublication.updateState(unlockState);
            },

            fail: reason => {
                lockupPublication.fail(reason);
            },

            finish: done => {
                lockupPublication.finish(done);
            }
        }

        observeNotifier(periodNotifier, observer);

        return harden({message: "Unlock operation succeeded", publicSubscribers: { subscription }})
    };

    const redeem = async (userSeat) => {
        const {give: { RedeemToken: redeemTokenAmount }, want: { LpTokens: lpTokensAmount }} = userSeat.getProposal();
        const redeemToken = redeemTokenAmount.value[0];
        const currentTimestamp = await E(timerService).getCurrentTimestamp();
        if (redeemToken.unbondingPeriod) {
            const unbondingPeriodInSeconds = daysToSeconds(redeemToken.unbondingPeriod);
            assert(redeemToken.unbondingTimestamp + unbondingPeriodInSeconds > currentTimestamp, `You are still in the unbonding period. Cannot redeem the LP tokens yet`);
        } else {
            const bondingPeriodInSeconds = daysToSeconds(redeemToken.bondingPeriod);
            assert(redeemToken.lockingTimestamp + bondingPeriodInSeconds > currentTimestamp, `You are still in the bonding period. Cannot redeem tokens`);
        }

        assert(lpTokensAmount.value === amountLockedIn.value, `The amount you are trying to reddem is diferent than the one locked in`);
        assert(lpTokensAmount.brand === amountLockedIn.brand, `The brand of the LP tokens you are trying to redeem is different than the one locked in`);

        // TODO: Check if there are still rewards to collect
        userSeat.incrementBy(
            zcfSeat.decrementBy(harden({ LpTokens: lpTokensAmount }))
        )

        zcfSeat.incrementBy(
            userSeat.decrementBy(harden({ RedeemToken: redeemTokenAmount}))
        )

        zcf.reallocate();

        // TODO: Should we burn the redeem token?
        // Kill all notifiers

        userSeat.exit();

        return "Tokens redeemed";
    }

    return Far('lockup manager', {
        lockup,
        unlock,
        redeem
    })
};

//   const withdraw = async (userSeat, offerArgs) => {
//     // What most likely with this method is (two possible options):
//     // 1 - User Wants governance tokens (the amount sent in the message) and Gives the Lockup NFT
//     //  Here we need to check if it is an antipatter putting the NFT in the Give but not actually exchanging it
//     // 2 - If we need to exchange the NFT we add a new metadata field which holds the amount of days whose rewards have already been withdrawn

//   };

//   const redeem = async (userSeat, offerArgs) => {
//     assertProposalShape(userSeat, {
//       give: { RedeemToken: null }, // RedeemToken is one of PolToken or UnbondingToken given before
//       want: { LpTokens: null },
//     })

//     const {give: { RedeemToken: redeemTokenAmount }, want: { LpTokens: lpTokensAmount }} = userSeat.getProposal();
//     const redeemToken = redeemTokenAmount.value[0];
//     if (redeemToken.unbondingPeriod) {
//       const unbondingPeriodInSeconds = daysToSeconds(redeemToken.unbondingPeriod);
//       const currentTimestamp = await E(timerService).getCurrentTimestamp();

//       assert(redeemToken.unbondingTimestamp + unbondingPeriodInSeconds <= currentTimestamp, `You are still in the unbonding period. Cannot redeem the LP tokens yet`);
//     }
//     // TODO: Check if any rewards are left to hand out
//     assert(lpTokensAmount.value === redeemToken.amountLockedIn, `The amount wanted is not the same as the amount locked in`);
//     assert(lpTokensAmount.brand === redeemToken.brandLockedIn, `The brand of the amount wanted is not the same as the brand locked in`);

//     userSeat.incrementBy(
//       zcfSeat.decrementBy(harden({LpTokens: lpTokensAmount}))
//     )
//     zcfSeat.incrementBy(
//       userSeat.decrementBy(harden({ReddemToken: redeemTokenAmount}))
//     )
//     zcf.reallocate(zcfSeat, userSeat);
//     // TODO: Should we burn the redeem token?
//     userSeat.exit();
//     return "Success. Your LP tokens are redeemed";
//   }