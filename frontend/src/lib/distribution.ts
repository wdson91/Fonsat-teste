import type { Allocation, UserOption, NamedItem } from './contracts.ts';
import { calendarShift, lisbonDay } from './lisbon.ts';

export function allocationOnDay(
  allocations: Allocation[],
  workerId: number,
  day: string,
) {
  return (
    allocations.find(
      (item) =>
        item.workerId === workerId &&
        lisbonDay(new Date(item.startDate)) <= day &&
        (!item.endDate || lisbonDay(new Date(item.endDate)) > day),
    ) ?? null
  );
}
export function habitualTrade(worker: UserOption, trades: NamedItem[]) {
  return trades.find((trade) => trade.id === worker.defaultTrade?.id) ?? null;
}
export function previousWeekPlan(
  allocations: Allocation[],
  workers: UserOption[],
  monday: string,
  siteId = '',
) {
  const tasks: Array<{
    workerId: number;
    siteId: number;
    tradeId: number;
    startDate: string;
    endDate: string;
  }> = [];
  let preserved = 0;
  for (const worker of workers) {
    for (let offset = 0; offset < 7; offset++) {
      const day = calendarShift(monday, offset);
      const source = allocationOnDay(
        allocations,
        worker.id,
        calendarShift(day, -7),
      );
      if (!source || (siteId && source.siteId !== Number(siteId))) continue;
      if (allocationOnDay(allocations, worker.id, day)) {
        preserved++;
        continue;
      }
      tasks.push({
        workerId: worker.id,
        siteId: source.siteId,
        tradeId: source.tradeId,
        startDate: day,
        endDate: calendarShift(day, 1),
      });
    }
  }
  return { tasks, preserved };
}
