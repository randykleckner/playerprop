export function persistSimulation(db: D1Database,result:Record<string,unknown>,timing?:{startedAt?:string;completedAt?:string}):Promise<string>;
