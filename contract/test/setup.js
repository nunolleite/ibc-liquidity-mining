//@ts-check

import { makeZoeKit } from "@agoric/zoe"
import { makeFakeVatAdmin } from "@agoric/zoe/tools/fakeVatAdmin.js"
import bundleSource from "@endo/bundle-source";
import { E } from "@endo/far";
import buildManualTimer from "@agoric/zoe/tools/manualTimer.js"
import { getGovernanceTokenKit, getInitialSupportedIssuers } from "./helpers.js";
import { lockupStrategies, rewardStrategyTypes } from "../src/definitions.js";

const setupContract = async () => {
    const { zoeService } = makeZoeKit(makeFakeVatAdmin().admin);
    const  feePurse  = await E(zoeService).makeFeePurse();
    const zoe = E(zoeService).bindDefaultFeePurse(feePurse);

    // @ts-ignore
    const contractPath = new URL('../src/contract.js', import.meta.url).pathname;
    const bundle = await bundleSource(contractPath);
    const installation = await E(zoe).install(bundle);

    const timer = buildManualTimer(message => {});

    return {
        zoe,
        installation,
        timer
    }
};

const initializeContract = async (zoe, installation, timer, lockupStrategy = "", rewardsStrategy = {}, warnMinimumGovernanceTokenSupply = 0n) => {
    const issuers = getInitialSupportedIssuers();
    const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
    const governanceTokenKit = getGovernanceTokenKit();
    let decidedLockStrategy, decidedRewardsStrategy;

    if (lockupStrategy === "") decidedLockStrategy = lockupStrategies.TIMED_LOCKUP;
    else decidedLockStrategy = lockupStrategy;

    if (!rewardsStrategy.type) decidedRewardsStrategy = { type: rewardStrategyTypes.LINEAR, definition: 0.5};
    else decidedRewardsStrategy = rewardsStrategy;

    const terms = harden({
        timerService: timer,
        initialSupportedIssuers: initialIssuers,
        lockupStrategy: decidedLockStrategy,
        rewardStrategy: decidedRewardsStrategy,
        gTokenBrand: governanceTokenKit.brand,
        warnMinimumGovernanceTokenSupply
    });

    const { creatorFacet, publicFacet } = await E(zoe).startInstance(
        installation,
        { Governance: governanceTokenKit.issuer },
        terms
    );

    return {
        governanceTokenKit,
        issuers,
        creatorFacet,
        publicFacet
    };
}

export {
    setupContract,
    initializeContract
}