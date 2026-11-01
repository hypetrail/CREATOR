export interface LoadLimit {
  capacity?: number | null;
  capacity_exclusive?: boolean;
}

/** Compare the complete load: driver, any authorized passenger and baggage. */
export function supportsLoad(limit:LoadLimit,weight:number):boolean {
  if(!Number.isFinite(weight)||weight<=0||!Number.isFinite(limit.capacity)||!limit.capacity||limit.capacity<=0)return false;
  return limit.capacity_exclusive===true?weight<limit.capacity:weight<=limit.capacity;
}
