import { lockupStrategies, rewardStrategyTypes } from "./definitions";

const checkLockupStrategy = givenLockupStrategy => {
    return Object.values(lockupStrategies).includes(givenLockupStrategy);
};

const checkRewardStrategyType = givenRewardStrategyType => {
    return Object.values(rewardStrategyTypes).includes(givenRewardStrategyType);
};

const checkRewardStrategyStructure = givenRewardStrategy => {
    return "type" && "definition" in givenRewardStrategy;
}

const checkTiers = tiers => {
    const checkObjectCorrectness = tier => {
        return "tokenAmount" && "timeAmount" in tier;
    }

    return tiers.every(checkObjectCorrectness);
}

harden(checkTiers);
harden(checkLockupStrategy);
harden(checkRewardStrategyType);
harden(checkRewardStrategyStructure);

export {
    checkTiers,
    checkLockupStrategy,
    checkRewardStrategyType,
    checkRewardStrategyStructure
};