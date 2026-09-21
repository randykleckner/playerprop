// Restricted query grammar. Unsupported requests are visible, never silently invented.
export function interpretQuery(text){
 const request=text.trim(),filters={},assumptions={},unhandled=[];
 const position=request.match(/\b(QB|RB|WR|TE|DST)s?\b/i);if(position)filters.position=position[1].toUpperCase();
 const salary=request.match(/(?:under|max(?:imum)?(?: salary)?)\s*\$?([\d,]+)/i);if(salary)filters.maxSalary=Number(salary[1].replaceAll(',',''));
 const targets=request.match(/(?:at least|min(?:imum)?)\s+(\d+)\s+targets/i);if(targets)filters.minTargets=Number(targets[1]);
 const score=request.match(/(?:exceed|above|scor(?:e|ing))\s+(\d+(?:\.\d+)?)\s*(?:DK\s*)?points/i);if(score)assumptions.pointsThreshold=Number(score[1]);
 if(/bottom|top.?10|defen[cs]|weather|wind|injur|out\b|routes|snap/i.test(request))unhandled.push('Defense ranks, weather, injury and route requests require explicit supported controls; they have not been applied.');
 if(!position&&!salary&&!targets&&!score)unhandled.push('No supported filter recognized. Try “RBs under $6,000”.');
 return {request,filters,assumptions,unhandled};
}
