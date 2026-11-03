export const CUSTOMER_LOGIN_MAP = {
  "ALLIANCE MOVERS": { touchUsername: "ALLIANCE02", accountId: "KAIZEN" },
  "SGL": { touchUsername: "KTTSG01", accountId: "KAIZEN" },
};

export function getLoginForCustomer(customer) {
  const key = (customer || "").trim().toUpperCase();
  return CUSTOMER_LOGIN_MAP[key] || null;
}

export function parseOperationMail(body) {
  if (!body) return [];
  const jobs = [];

  return jobs;
}


export function groupJobsByCustomer(jobs = []) {
  return jobs.reduce((acc, job) => {
    const key = (job.customer || "UNKNOWN").trim().toUpperCase();
    (acc[key] ||= []).push(job);
    return acc;
  }, {});
}


export function injectJob(job, setFormValues) {
  if (!job || typeof setFormValues !== "function") return;
  setFormValues((prev) => ({
    ...prev,

  }));
}


export async function handleCustomerClick({
  customer,
  jobs,
  email,
  switchLogin,
  triggerOut,
  setFormValues,
}) {
  const login = getLoginForCustomer(customer);
  if (!login) {
    throw new Error(`No login mapped for customer "${customer}"`);
  }

  await switchLogin(login); // e.g. { touchUsername: "ALLIANCE02", accountId: "KAIZEN" }
  await triggerOut(email); // the existing Out button action

  // Inject the first job; the rest can be selected from the UI.
  if (jobs?.length) injectJob(jobs[0], setFormValues);
}