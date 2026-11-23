export const SESSION_ID = { type: 'string', minLength: 1, maxLength: 200, description: 'Exact session ID.' }
export const PROJECT_ID = {
  type: 'string', minLength: 1, maxLength: 200,
  description: 'Project ID from workbench_project_list, or "default" for the default chat workspace.',
}
export const MESSAGE = { type: 'string', minLength: 1, maxLength: 16_000 }
export const LIMIT = { type: 'integer', minimum: 1, maximum: 50 }

export function failure(code, message) {
  return Object.assign(new Error(message), { code })
}

export function register(ctx, name, description, properties, required, run, options = {}) {
  ctx.tools.register({
    name: `workbench_${name}`,
    description,
    parameters: { type: 'object', properties, required, additionalProperties: false },
    output: {
      schema: { type: 'object', properties: {}, additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    ...options,
    async execute(args, { agent, signal }) {
      signal.throwIfAborted()
      const caller = agent?.session?.header
      if (!caller?.id || caller.origin === 'subagent') {
        throw failure('SESSION_SCOPE', 'Use this tool from an independent session.')
      }
      validate(args, properties, required)
      return run(args, caller, signal)
    },
  })
}

function validate(args, properties, required) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw failure('INVALID_ARGS', 'Tool arguments must be an object.')
  }
  for (const key of required) {
    if (!Object.hasOwn(args, key)) throw failure('INVALID_ARGS', `${key} is required.`)
  }
  for (const [key, value] of Object.entries(args)) {
    const spec = Object.hasOwn(properties, key) && properties[key]
    const valid = spec && (spec.type === 'string'
      ? typeof value === 'string' && value.trim().length >= spec.minLength && value.length <= spec.maxLength
      : Number.isSafeInteger(value) && value >= spec.minimum && value <= (spec.maximum ?? Number.MAX_SAFE_INTEGER))
    if (!valid) throw failure('INVALID_ARGS', `Invalid ${key}.`)
  }
}
