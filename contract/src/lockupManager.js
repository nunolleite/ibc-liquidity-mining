//@ts-check
import '@agoric/zoe/exported.js';
import { AmountMath } from "@agoric/ertp";
import { makeSubscriptionKit } from "@agoric/notifier";
import { E } from "@endo/eventual-send";
import { Far } from "@endo/marshal";
import { lockupStrategies, rewardStrategyTypes } from "./definitions";
import { daysToSeconds } from "./helpers";

/**
 * 
 * @param {ZCF} zcf 
 * @param {ZCFSeat} zcfSeat 
 * @param {String} lockupId 
 * @param {String} lockupStrategy 
 * @param {String} rewardStrategyType 
 * @param {Number | Function | Object} rewardStrategyValue 
 * @param {ERef<TimerService>} timerService 
 * @param {Brand} polBrand 
 * @param {ZCFMint} polMint 
 * @param {Brand} gTokenBrand 
 * @param {Amount} amountLockedIn 
 * @returns {Object}
 */
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
    let lockingTimestamp = 0n;
    let unbondingTimestamp = 0n;
    let hasExpired = false;

    /**
     * 
     * @param {bigint} timeLockedIn 
     * @returns {Number}
     */
    const calculateCurrentRewards = (timeLockedIn) => {
        const tokensLockedIn = BigInt(amountLockedIn.value.toString());
        if (rewardStrategyType === rewardStrategyTypes.LINEAR) {
            return Number(tokensLockedIn * timeLockedIn * (rewardStrategyValue ? rewardStrategyValue : 1)) - rewardsCollected;
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
        return Number(tier.tokenAmount) * Number(tokensLockedIn) - rewardsCollected;
    }

    /**
     * 
     * @param {bigint} currentTimestamp 
     * @returns {Object} {timeLockedIn, hasPassed}
     */
    const getTimeLockInformation = currentTimestamp => {
        let mostRecentConsideredTimestamp = 0n;
        let hasPassed = false;

        if (unbondingTimestamp) {
            const unbondingPeriodInSeconds = daysToSeconds(lockupUnbondingPeriod);
            hasPassed = unbondingTimestamp + unbondingPeriodInSeconds > currentTimestamp;
            mostRecentConsideredTimestamp = hasPassed ? lockingTimestamp + unbondingTimestamp + unbondingPeriodInSeconds : currentTimestamp
        }

        if (lockupBondingPeriod) {
            const bondingPeriodInSeconds = daysToSeconds(lockupBondingPeriod);
            hasPassed = lockingTimestamp + bondingPeriodInSeconds > currentTimestamp;
            mostRecentConsideredTimestamp = hasPassed ? lockingTimestamp + bondingPeriodInSeconds : currentTimestamp;
        }

        return {timeLockedIn: mostRecentConsideredTimestamp - lockingTimestamp, hasPassed};
    }

    /**
     * 
     * @param {bigint} currentTimestamp 
     * @returns {Object}
     */
    const checkLockupState = (currentTimestamp) => {

        const { timeLockedIn, hasPassed } = getTimeLockInformation(currentTimestamp);
        const currentRewards = calculateCurrentRewards(timeLockedIn);

        let message = `You currently have ${currentRewards} governance tokens to collect.`;
        message += hasPassed ? 'Your token lockup has expired, no more rewards will be generated.' : ''

        hasExpired = hasPassed;
        return {
            expired: hasPassed,
            rewardsToCollect: currentRewards,
            message: message
        }
    };

    /**
     * 
     * @param {ZCFSeat} userSeat 
     * @param {Object} offerArgs 
     * @returns {Promise<Object>}
     */
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

    /**
     * 
     * @param {ZCFSeat} userSeat 
     * @param {Object} offerArgs 
     * @returns {Promise<Object>}
     */
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

    /**
     * 
     * @param {ZCFSeat} userSeat 
     * @returns {Promise<Object>}
     */
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

        const { timeLockedIn } = getTimeLockInformation(currentTimestamp);
        const currentRewards = calculateCurrentRewards(timeLockedIn);
        assert(currentRewards === 0.0, `Please collect all your rewards before redeeming your tokens, otherwise the rewards will be lost`);

        userSeat.incrementBy(
            zcfSeat.decrementBy(harden({ LpTokens: lpTokensAmount }))
        )

        zcfSeat.incrementBy(
            userSeat.decrementBy(harden({ RedeemToken: redeemTokenAmount }))
        )

        zcf.reallocate(zcfSeat, userSeat);

        polMint.burnLosses({ RedeemToken: redeemTokenAmount }, zcfSeat)

        if (lockupPublication) lockupPublication.finish(harden({message : 'Tokens redeemed'}));

        userSeat.exit();

        return "Tokens redeemed";
    }

    /**
     * 
     * @param {ZCFSeat} userSeat 
     * @returns {Promise<Object>}
     */
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

        rewardsCollected += Number(governanceTokenAmount.value);

        userSeat.exit();

        return `Successfully collected ${governanceTokenAmount.value} governance tokens`;
    };

    /**
     * 
     * @param {bigint} updateTime 
     */
    const notifyStateUpdate = updateTime => {
        const stateUpdate = checkLockupState(updateTime);
        lockupPublication.updateState(stateUpdate);
    };

    /**
     * 
     * @param {String | Object} reason 
     */
    const notifyFail = reason => {
        lockupPublication.fail(reason);
    };

    /**
     * 
     * @param {String | Object} done 
     */
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