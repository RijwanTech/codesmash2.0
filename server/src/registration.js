import { Setting } from './models.js';

const KEY = 'registration';

/**
 * Online registration state. It is closed when the organiser closes it OR when the deadline has passed.
 * Spot registration (added by the organiser) always works, whatever this says.
 */
export async function getRegistration() {
  const doc = await Setting.findOne({ key: KEY }).lean();
  const v = doc?.value ?? {};
  const open = v.open !== false;
  const closesAt = v.closesAt ? new Date(v.closesAt).getTime() : null;
  const deadlinePassed = closesAt !== null && Date.now() >= closesAt;
  return { open, closesAt, deadlinePassed, effectiveOpen: open && !deadlinePassed };
}

export async function setRegistration({ open, closesAt }) {
  await Setting.findOneAndUpdate(
    { key: KEY },
    { $set: { value: { open: !!open, closesAt: closesAt ? new Date(closesAt) : null } } },
    { upsert: true },
  );
  return getRegistration();
}
