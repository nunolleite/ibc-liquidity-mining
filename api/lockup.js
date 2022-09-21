//@ts-check

import { E } from '@endo/far';
import contractDefaults from '../assets/dapp-constants/installationConstants.js';
import { AmountMath, AssetKind } from '@agoric/ertp';
import { lockupStrategies } from '../contract/src/definitions.js';

const LOCKUP_STRAT = lockupStrategies.TIMED_LOCKUP;

const lockup = async (homePromise, {}) => {
    const home = await homePromise;
    const {
        board,
        zoe,
        wallet
    } = home;

    const {
        PUBLIC_FACET_ID,
        MOOLA_PURSE_PETNAME,
        MOOLA_ISSUER_ID,
        POL_TOKEN_ISSUER_ID
    } = contractDefaults;

    const publicFacet = await E(board).getValue(PUBLIC_FACET_ID);
    const tokenPurse = await E(wallet).getPurse(MOOLA_PURSE_PETNAME);
    const moolaIssuer = await E(board).getValue(MOOLA_ISSUER_ID);
    const lockupInvitation = await E(publicFacet).makeLockupInvitation();
    const polTokenIssuer = await E(board).getValue(POL_TOKEN_ISSUER_ID);

    console.log("Building lockup amount ...");
    const lockupAmount = AmountMath.make(await E(moolaIssuer).getBrand(), 10n);

    console.log("Building proposal ....");
    const lockupProposal = harden({
        give: { LpTokens: lockupAmount},
        want: { PolToken: AmountMath.makeEmpty(await E(polTokenIssuer).getBrand(), AssetKind.SET)}
    });

    console.log("Building payment ...");
    const lockupPayment = harden({
        LpTokens: await E(tokenPurse).withdraw(lockupAmount)
    });

    console.log("Initiating lockup ...");

    const offerArgs = {};

    if(LOCKUP_STRAT === lockupStrategies.TIMED_LOCKUP) offerArgs["bondingPeriod"] = 2;

    const seat = await E(zoe).offer(
        lockupInvitation,
        lockupProposal,
        lockupPayment,
        offerArgs
    );

    console.log("Lockup initiated ...");

    const result = await E(seat).getOfferResult();
    
    console.log("--- Board ID for Subscription ---");
    console.log(await E(board).getId(result.publicSubscribers.subscription));

    const payment = await E(seat).getPayout('PolToken');
    const purse = await E(wallet).getPurse('POL');
    await E(purse).deposit(payment);

    console.log('Token deposited in POL purse ...');
};

export default lockup;