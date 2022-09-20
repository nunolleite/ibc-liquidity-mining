//@ts-check

import { E } from '@endo/far';
import contractDefaults from '../assets/dapp-constants/installationConstants.js';
import { AmountMath } from '@agoric/ertp';

const redeem = async (homePromise, {}) => {
    const home = await homePromise;

    const {
        board,
        zoe,
        wallet
    } = home;

    const {
        PUBLIC_FACET_ID,
        MOOLA_ISSUER_ID,
        MOOLA_PURSE_PETNAME,
        POL_TOKEN_PURSE_PETNAME,
    } = contractDefaults;

    const [publicFacet, moolaIssuer, moolaPurse, polPurse] = await Promise.all([
        E(board).getValue(PUBLIC_FACET_ID),
        E(board).getValue(MOOLA_ISSUER_ID),
        E(wallet).getPurse(MOOLA_PURSE_PETNAME),
        E(wallet).getPurse(POL_TOKEN_PURSE_PETNAME)
    ]);

    console.log('Building redeem amounts ....');
    const giveAmount = await E(polPurse).getCurrentAmount();
    const wantAmount = AmountMath.make(await E(moolaIssuer).getBrand(), 10n);
    const payment = await E(polPurse).withdraw(giveAmount);
    const paymentKeywordRecord = { RedeemToken: payment };

    console.log("Requesting invitation ...");
    const invitation = await E(publicFacet).makeRedeemInvitation();

    console.log("Building proposal ...");
    const proposal = harden({
        give: { RedeemToken: giveAmount },
        want: { LpTokens: wantAmount }
    });

    console.log("Sending the redeem offer ...")
    const seat = await E(zoe).offer(
        invitation,
        proposal,
        paymentKeywordRecord
    );
    
    const result = await E(seat).getOfferResult();

    console.log(result);

    const payout = await E(seat).getPayout('LpTokens');

    await E(moolaPurse).deposit(payout);

};

export default redeem;