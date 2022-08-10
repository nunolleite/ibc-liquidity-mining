//@ts-check
import { lockupStrategies, rewardStrategyTypes } from "./definitions";

/**
 * 
 * @param {String} givenLockupStrategy 
 * @returns {Boolean}
 */
const checkLockupStrategy = givenLockupStrategy => {
    return Object.values(lockupStrategies).includes(givenLockupStrategy);
};

/**
 * 
 * @param {String} givenRewardStrategyType 
 * @returns {Boolean}
 */
const checkRewardStrategyType = givenRewardStrategyType => {
    return Object.values(rewardStrategyTypes).includes(givenRewardStrategyType);
};

/**
 * 
 * @param {Object} givenRewardStrategy 
 * @returns {Boolean}
 */
const checkRewardStrategyStructure = givenRewardStrategy => {
    return "type" && "definition" in givenRewardStrategy;
}

/**
 * 
 * @param {Array<Object>} tiers 
 * @returns {Boolean}
 */
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