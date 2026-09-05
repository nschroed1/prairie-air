type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
};
type ModelDocument = Document & {
  modelContext?: {
    registerTool: (
      tool: Tool,
      options: { signal: AbortSignal },
    ) => void | Promise<void>;
  };
};
import {
  Simulation,
  contracts,
  freshControls,
  type Controls,
} from './simulation';

export function registerFlightTools(
  sim: Simulation,
  controls: Controls,
  onStart: () => void,
) {
  const context = (document as ModelDocument).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const status = () => ({
    phase: sim.phase,
    contractId: sim.job.id,
    contract: sim.job.name,
    coverage: Math.round(sim.coverage * 10) / 10,
    target: sim.job.target,
    bonusTarget: sim.job.bonusTarget,
    altitudeFeet: Math.round(sim.altitude * 3.281),
    tankPercent: Math.round((sim.tank / sim.tankCapacity) * 100),
    cash: sim.career.cash,
  });
  const tools: Tool[] = [
    {
      name: 'get_flight_status',
      description:
        'Read the current Prairie Air flight, coverage, spray tank, and career balance.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => status(),
    },
    {
      name: 'start_flight_contract',
      description:
        'Start or restart a Prairie Air contract and reset its coverage. Contract IDs are 0 (Miller corn), 1 (Willow Creek soybeans), or 2 (Cedar Valley pasture).',
      inputSchema: {
        type: 'object',
        properties: { contractId: { type: 'integer', minimum: 0, maximum: 2 } },
        required: ['contractId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => {
        const id = (input as { contractId?: unknown })?.contractId;
        if (typeof id !== 'number' || !Number.isInteger(id) || !contracts[id])
          throw new Error('contractId must be 0, 1, or 2.');
        sim.reset(contracts[id]);
        Object.assign(controls, freshControls());
        onStart();
        return status();
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  }
  return () => lifecycle.abort();
}
