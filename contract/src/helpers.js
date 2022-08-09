
const getDaysInSeconds = numberOfDays => {
    return numberOfDays * 24 * 60 * 60;
}

harden(getDaysInSeconds);

export {
    getDaysInSeconds
};