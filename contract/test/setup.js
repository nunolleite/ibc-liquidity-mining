//@ts-check

import { makeZoeKit } from "@agoric/zoe"
import { makeFakeVatAdmin } from "@agoric/zoe/tools/fakeVatAdmin.js"
import bundleSource from "@endo/bundle-source";
import { E, Far} from "@endo/far";
import buildManualTimer from "@agoric/zoe/tools/manualTimer.js"
import { getGovernanceTokenKit, getInitialSupportedIssuers } from "./helpers.js";
import { lockupStrategies, rewardStrategyTypes } from "../src/definitions.js";
import { makeIssuerKit } from "@agoric/ertp";

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

const getAmmPublicFacet = async issuers => {

    const getLiquidityIssuer = async brand => {
        const mapping = {
            [issuers.moola.brand]: issuers.moola.issuer,
            [issuers.van.brand]: issuers.van.issuer
        }

        const liquidityIssuer = mapping[brand];

        if(!liquidityIssuer) throw new Error(`Liquidity issuer with brand ${brand.getAllegedName()} does not exist in the AMM`);

        return liquidityIssuer;
    }

    return Far('Mock AMM Public Facet', {
        getLiquidityIssuer
    })
}

const initializeContractWithoutIssuerInAMM = async (zoe, installation, timer) => {
    const issuers = getInitialSupportedIssuers();
    const unsupported = makeIssuerKit('Unsupported');
    const initialIssuers = [issuers.moola.issuer, issuers.van.issuer, unsupported.issuer];
    const governanceTokenKit = getGovernanceTokenKit();

    const ammPublicFacet = await getAmmPublicFacet(issuers);

    const terms = harden({
        ammPublicFacet,
        timerService: timer,
        initialSupportedIssuers: initialIssuers,
        lockupStrategy: lockupStrategies.TIMED_LOCKUP,
        rewardStrategy: {type: rewardStrategyTypes.LINEAR, definition: 1},
        gTokenBrand: governanceTokenKit.brand,
        warnMinimumGovernanceTokenSupply: 100n
    });

    const { creatorFacet, publicFacet } = await E(zoe).startInstance(
        installation,
        { Governance: governanceTokenKit.issuer },
        terms
    );

    return {
        creatorFacet,
        publicFacet,
        governanceTokenKit,
        issuers
    }
}

const initializeContract = async (zoe, installation, timer, lockupStrategy = "", rewardsStrategy = {}, warnMinimumGovernanceTokenSupply = 0n) => {
    const issuers = getInitialSupportedIssuers();
    const initialIssuers = [issuers.moola.issuer, issuers.van.issuer];
    const governanceTokenKit = getGovernanceTokenKit();
    let decidedLockStrategy, decidedRewardsStrategy;

    if (lockupStrategy === "") decidedLockStrategy = lockupStrategies.TIMED_LOCKUP;
    else decidedLockStrategy = lockupStrategy;

    if (!rewardsStrategy.type) decidedRewardsStrategy = { type: rewardStrategyTypes.LINEAR, definition: 0.5};
    else decidedRewardsStrategy = rewardsStrategy;

    const ammPublicFacet = await getAmmPublicFacet(issuers);

    const terms = harden({
        ammPublicFacet,
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
    initializeContract,
    initializeContractWithoutIssuerInAMM
}