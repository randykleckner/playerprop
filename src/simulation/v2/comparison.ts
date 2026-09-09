import {fingerprint} from '../../../public/simulation/random.js';
/** A neutral envelope, not a claim of equivalent V1 player and V2 team metrics. */
export function comparisonEnvelope<T>(modelVersion:'V1'|'V2',engineVersion:string,seed:string,inputsTimestamp:string,inputFingerprint:string,summary:T){return {modelVersion,engineVersion,runId:fingerprint({modelVersion,engineVersion,seed,inputsTimestamp,inputFingerprint}),seed,inputsTimestamp,inputFingerprint,summary};}
