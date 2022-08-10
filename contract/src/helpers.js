import { rewardStrategyTypes } from "./definitions";
const SECONDS_PER_HOUR = 60n * 60n;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * 24;


const daysToSeconds = numberOfDays => {
    return numberOfDays * SECONDS_PER_DAY;
}

const secondsToDays = numberOfSeconds => {
    // We are not flooring this on purpose, to allow custom time rewards using the CUSTOM or LINEAR strategies
    return numberOfSeconds / SECONDS_PER_DAY;
}

const orderTiers = tiers => {
    tiers.sort((a,b) => a.timeAmount < b.timeAmount ? -1 : 1);
}

const calculateRewards = (rewardStrategyType, rewardStrategyValue, amountLockedIn, timeLockedIn) => {
    if (rewardStrategyType === rewardStrategyTypes.LINEAR) return amountLockedIn * timeLockedIn * (rewardStrategyValue ? rewardStrategyValue : 1);
    if (rewardStrategyType === rewardStrategyTypes.CUSTOM) return rewardStrategyValue(amountLockedIn, timeLockedIn);

    let tier = null;
    for (const valueTier of rewardStrategyValue) {
        if (valueTier.timeAmount > timeLockedIn) {
            // We know tiers are ordered asceding by timeAmount
            break;
        }

        tier = valueTier;
    }

    if (!tier) return 0;
    return tier.tokenAmount * amountLockedIn;
}

const checkNewState = (rewardStrategyType, rewardStrategyValue, proofToken, currentTimestamp) => {
    // TODO: When rewards are withdrawn we need to issue another proofToken so that we know how many rewards need to be extracted yet
    const { amountLockedIn, brandLockedIn, initialTimestamp, bondingPeriod, unbondingPeriod, unbondingTimestamp } = proofToken;
    let timeLockedIn = 0;
    let mostRecentConsideredTimestamp = 0;
    let hasPassed = false;

    // proofOfToken will only have one of unbonding period or bonding period

    if(unbondingTimestamp) {
        const unbondingPeriodInSeconds = daysToSeconds(unbondingPeriod);
        hasPassed = unbondingTimestamp + unbondingPeriodInSeconds > currentTimestamp;
        mostRecentConsideredTimestamp = hasPassed ? unbondingTimestamp + unbondingPeriodInSeconds : currentTimestamp
    }

    if(bondingPeriod) {
        const bondingPeriodInSeconds = daysToSeconds(bondingPeriod);
        hasPassed = initialTimestamp + bondingPeriodInSeconds > currentTimestamp;
        mostRecentConsideredTimestamp = hasPassed ? bondingPeriodInSeconds : currentTimestamp;
    }

    timeLockedIn = mostRecentConsideredTimestamp - initialTimestamp;
    const rewards = calculateRewards(rewardStrategyType, rewardStrategyValue, amountLockedIn, timeLockedIn);

    // TODO: We need to subtract rewards that may have already been collected by the user

    let message = `You currently have ${rewards} governance tokens to collect.`;
    message += hasPassed ? 'Your token lockup has expired, no more rewards will be generated.' : ''

    return {
        expired: hasPassed,
        rewardsToCollect: rewards,
        message: message
    }
}

harden(daysToSeconds);
harden(secondsToDays);
harden(orderTiers);
harden(checkNewState);

export {
    daysToSeconds,
    secondsToDays,
    checkNewState,
    orderTiers,
    SECONDS_PER_HOUR,
    SECONDS_PER_DAY
};