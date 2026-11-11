export const NNR_CUSTOMER_LOGIN_MAP = {
    "GE ENGINE": { touchUsername: "NNREXPAdmin", accountId: "NNR" },
    "GE MATERIALS": { touchUsername: "NNREXPAdmin", accountId: "NNR" },
    "ZEBRA TECH": { touchUsername: "NNREXPAdmin", accountId: "NNR" },
    "YAMAHA": { touchUsername: "NNREXPAdmin", accountId: "NNR" },
    // "OTHERS": { touchUsername: "NNREXPAdmin", accountId: "NNR" },
};

export function getNnrLoginForCustomer(customer) {
    const key = (customer || "").trim().toUpperCase();
    return NNR_CUSTOMER_LOGIN_MAP[key] || null;
}


export function parseNnrMail(body) {
    if (!body) return [];
    const text = String(body).toUpperCase();
    const jobs = [];

    Object.keys(NNR_CUSTOMER_LOGIN_MAP).forEach((customer) => {
        if (text.includes(customer)) {
            jobs.push({ customer });
        }
    });

    return jobs;
}

export function groupNnrJobsByCustomer(jobs = []) {
    return jobs.reduce((acc, job) => {
        const key = (job.customer || "UNKNOWN").trim().toUpperCase();
        (acc[key] ||= []).push(job);
        return acc;
    }, {});
}

export function injectNnrJob(job, setFormValues) {
    if (!job || typeof setFormValues !== "function") return;
    setFormValues((prev) => ({
        ...prev,
    }));
}

export async function handleNnrCustomerClick({
    customer,
    jobs,
    email,
    switchLogin,
    triggerOut,
    setFormValues,
}) {
    const login = getNnrLoginForCustomer(customer);
    if (!login) {
        throw new Error(`No NNR login mapped for customer "${customer}"`);
    }

    await switchLogin(login);
    await triggerOut(email);

    if (jobs?.length) injectNnrJob(jobs[0], setFormValues);
}