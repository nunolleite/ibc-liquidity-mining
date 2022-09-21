//@ts-check

import { E } from '@endo/far';
import contractDefaults from '../assets/dapp-constants/installationConstants.js';
import { AmountMath, AssetKind } from '@agoric/ertp';

const unlock = async (homePromise, {}) => {
    const home = await homePromise;
    const {
        board,
        zoe,
        wallet
    } = home;

    const {
        PUBLIC_FACET_ID,
        POL_TOKEN_ISSUER_ID,
        POL_TOKEN_PURSE_PETNAME
    } = contractDefaults;

    const [publicFacet, polTokenIssuer, polTokenPurse] = await Promise.all([
        E(board).getValue(PUBLIC_FACET_ID),
        E(board).getValue(POL_TOKEN_ISSUER_ID),
        E(wallet).getPurse(POL_TOKEN_PURSE_PETNAME)
    ]);

    const unlockInvitation = await E(publicFacet).makeUnlockInvitation();

    const [polTokenAmount, polTokenBrand] = await Promise.all([
        E(polTokenPurse).getCurrentAmount(),
        E(polTokenIssuer).getBrand()
    ]) 

    console.log("Preparing payment ...");
    const polTokenPayment = await E(polTokenPurse).withdraw(polTokenAmount);

    console.log("Preparing proposal ...");
    const proposal = harden({
        give: { PolToken: polTokenAmount },
        want: { UnbondingToken: AmountMath.makeEmpty(polTokenBrand, AssetKind.SET)}
    })

    const payment = harden({ PolToken: polTokenPayment });

    console.log("Issuing offer ...");
    const seat = await E(zoe).offer(
        unlockInvitation,
        proposal,
        payment,
        {
            unbondingPeriod: 2
        }
    );

    const result = await E(seat).getOfferResult();

    console.log(`Offer result: ${result}`);

    const payout = await E(seat).getPayout('UnbondingToken');

    console.log(payout);

    await E(polTokenPurse).deposit(payout);
}

export default unlock;