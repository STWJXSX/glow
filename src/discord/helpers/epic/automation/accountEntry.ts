/**
 * Plain copy of an `accounts` map entry, safe to spread into `accounts.set(key, {...})`.
 * Spreading the mongoose subdocument itself copies its internals (`$__`, `_doc`): mongoose then
 * rebuilds the entry from the ORIGINAL values and silently drops every field written next to it.
 */
export function plainAccountEntry<T extends object>(entry: T): T {
  const plain = typeof (entry as { toObject?: unknown }).toObject === 'function'
    ? (entry as unknown as { toObject(): T }).toObject()
    : { ...entry };
  delete (plain as { _id?: unknown })._id;
  return plain;
}
