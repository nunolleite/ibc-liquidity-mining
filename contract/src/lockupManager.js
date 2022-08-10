import { AmountMath } from "@agoric/ertp";
import { makeSubscriptionKit } from "@agoric/notifier";
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
    timerService,
    polBrand,
    polMint,
    gTokenBrand,
    amountLockedIn
) => {
    let lockupPublication = null;
    let rewardsCollected = 0.0;
    let lockupBondingPeriod = 0;
    let lockupUnbondingPeriod = 0;
    let lockingTimestamp = 0;
    let unbondingTimestamp = 0;
    let hasExpired = false;

    const calculateCurrentRewards = (timeLockedIn) => {
        const tokensLockedIn = amountLockedIn.value
        if (rewardStrategyType === rewardStrategyTypes.LINEAR) {
            return (tokensLockedIn * timeLockedIn * (rewardStrategyValue ? rewardStrategyValue : 1)) - rewardsCollected;
        }
        if (rewardStrategyType === rewardStrategyTypes.CUSTOM) {
            return rewardStrategyValue(tokensLockedIn, timeLockedIn) - rewardsCollected;
        }

        let tier = null;
        for (const valueTier of rewardStrategyValue) {
            if (valueTier.timeAmount > timeLockedIn) {
                // We know tiers are ordered asceding by timeAmount
                break;
            }

            tier = valueTier;
        }

        if (!tier) return 0;
        return tier.tokenAmount * tokensLockedIn - rewardsCollected;
    }

    const checkLockupState = (currentTimestamp) => {
        let timeLockedIn = 0;
        let mostRecentConsideredTimestamp = 0;
        let hasPassed = false;

        // proofOfToken will only have one of unbonding period or bonding period

        if (unbondingTimestamp) {
            const unbondingPeriodInSeconds = daysToSeconds(lockupUnbondingPeriod);
            hasPassed = unbondingTimestamp + unbondingPeriodInSeconds > currentTimestamp;
            mostRecentConsideredTimestamp = hasPassed ? lockingTimestamp + unbondingTimestamp + unbondingPeriodInSeconds : currentTimestamp
        }

        if (lockupBondingPeriod) {
            const bondingPeriodInSeconds = daysToSeconds(lockupBondingPeriod);
            hasPassed = initialTimestamp + bondingPeriodInSeconds > currentTimestamp;
            mostRecentConsideredTimestamp = hasPassed ? lockingTimestamp + bondingPeriodInSeconds : currentTimestamp;
        }

        timeLockedIn = mostRecentConsideredTimestamp - lockingTimestamp;
        const currentRewards = calculateCurrentRewards(timeLockedIn);

        let message = `You currently have ${currentRewards} governance tokens to collect.`;
        message += hasPassed ? 'Your token lockup has expired, no more rewards will be generated.' : ''

        hasExpired = hasPassed;
        return {
            expired: hasPassed,
            rewardsToCollect: rewards,
            message: message
        }
    };

    const lockup = async (userSeat, offerArgs) => {
        const { brand, value } = amountLockedIn;
        const currentTimestamp = await E(timerService).getCurrentTimestamp();
        lockingTimestamp = currentTimestamp;
        const polTokenAmountValue = {
            lockupId,
            amountLockedIn: value,
            brandLockedIn: brand,
            lockingTimestamp
        }
        if (lockupStrategy === lockupStrategies.TIMED_LOCKUP) {
            assert(typeof offerArgs === 'object', 'NO OFFER ARGUMENTS PRESENT');
            assert(offerArgs.hasOwnProperty('bondingPeriod'), 'NO OFFER ARGUMENTS PRESENT');
            polTokenAmountValue.bondingPeriod = offerArgs.bondingPeriod;
            lockupBondingPeriod = polTokenAmountValue.bondingPeriod;
        }

        const newPolTokenAmount = AmountMath.make(polBrand, [polTokenAmountValue]);
        polMint.mintGains(harden({ PolToken: newPolTokenAmount }), zcfSeat);

        zcfSeat.incrementBy(
            userSeat.decrementBy(harden({ LpTokens: amountLockedIn }))
        );

        userSeat.incrementBy(
            zcfSeat.decrementBy(harden({ PolToken: newPolTokenAmount }))
        );

        zcf.reallocate(zcfSeat, userSeat);

        const { publication, subscription } = makeSubscriptionKit();
        lockupPublication = publication;

        return harden({ message: "Succeeded. Tokens locked.", publicSubscribers: { subscription } });
    };

    const unlock = async (userSeat, offerArgs) => {
        lockupUnbondingPeriod = offerArgs.unbondingPeriod ? offerArgs.unbondingPeriod : 1;

        const { give: { PolToken: polTokenAmount } } = userSeat.getProposal();
        const polToken = polTokenAmount.value[0];
        const currentTimestamp = await E(timerService).getCurrentTimestamp();
        unbondingTimestamp = currentTimestamp;

        const newUnbondingTokenAmount = AmountMath.make(polBrand, [{
            ...polToken,
            unbondingPeriod: lockupUnbondingPeriod,
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

        polMint.burnLosses({ PolToken: polTokenAmount }, zcfSeat)

        const { publication, subscription } = makeSubscriptionKit();

        lockupPublication.finish({ message: "Unbonding has started", unbondingTimestamp: currentTimestamp });
        lockupPublication = publication;

        return harden({ message: "Unlock operation succeeded", publicSubscribers: { subscription } })
    };

    const redeem = async (userSeat) => {
        const { give: { RedeemToken: redeemTokenAmount }, want: { LpTokens: lpTokensAmount } } = userSeat.getProposal();
        const currentTimestamp = await E(timerService).getCurrentTimestamp();
        if (lockupUnbondingPeriod) {
            const unbondingPeriodInSeconds = daysToSeconds(lockupUnbondingPeriod);
            assert(unbondingTimestamp + unbondingPeriodInSeconds > currentTimestamp, `You are still in the unbonding period. Cannot redeem the LP tokens yet`);
        } else {
            const bondingPeriodInSeconds = daysToSeconds(lockupBondingPeriod);
            assert(lockingTimestamp + bondingPeriodInSeconds > currentTimestamp, `You are still in the bonding period. Cannot redeem tokens`);
        }

        assert(lpTokensAmount.value === amountLockedIn.value, `The amount you are trying to redeem is diferent than the one locked in`);
        assert(lpTokensAmount.brand === amountLockedIn.brand, `The brand of the LP tokens you are trying to redeem is different than the one locked in`);

        // TODO: Check if there are still rewards to collect
        userSeat.incrementBy(
            zcfSeat.decrementBy(harden({ LpTokens: lpTokensAmount }))
        )

        zcfSeat.incrementBy(
            userSeat.decrementBy(harden({ RedeemToken: redeemTokenAmount }))
        )

        zcf.reallocate();

        polMint.burnLosses({ RedeemToken: redeemTokenAmount }, zcfSeat)

        // TODO: Kill all notifiers

        userSeat.exit();

        return "Tokens redeemed";
    }

    const withdraw = async (userSeat) => {
        const { want: { Governance: governanceTokenAmount } } = userSeat.getProposal();
        assert(governanceTokenAmount.brand === gTokenBrand, `The given brand ${governanceTokenAmount.brand} is not the brand of the reward governance token`);
        const currentTimestamp = await E(timerService).getCurrentTimestamp();
        const currentState = checkLockupState(currentTimestamp);
        const { rewardsToCollect } = currentState;
        // The want clause is not an "equal", but an "at least"
        assert(rewardsToCollect >= governanceTokenAmount.value, `You do not have enough rewards to collect the given amount: ${governanceTokenAmount.value}`);

        userSeat.incrementBy(
            zcfSeat.decrementBy(harden({ Governance: governanceTokenAmount }))
        )

        zcf.reallocate(zcfSeat, userSeat);

        rewardsCollected += governanceTokenAmount.value;

        userSeat.exit();

        return `Successfully collected ${governanceTokenAmount.value} governance tokens`;
    };

    const notifyStateUpdate = updateTime => {
        const stateUpdate = checkLockupState(updateTime);
        lockupPublication.updateState(stateUpdate);

        if (hasExpired) {
            lockupPublication.finish(harden({ message: "Lockup has expired. Please collect your rewards and locked LP tokens" }));
        }
    };

    const notifyFail = reason => {
        lockupPublication.fail(reason);
    };

    const notifyFinish = done => {
        lockupPublication.finish(done);
    };

    return Far('lockup manager', {
        lockup,
        unlock,
        redeem,
        withdraw,
        notifyStateUpdate,
        notifyFail,
        notifyFinish
    })
};