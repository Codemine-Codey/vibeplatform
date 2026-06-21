import { tool } from 'ai'
import z from 'zod/v3'
import { loadSkillBody, SKILL_NAMES } from '@/ai/skills'

// Progressive-disclosure skill loader (the trigger→injection layers). The system
// prompt carries only the skill catalog (name + one-line description); when the
// model needs a skill's full guidance it calls this, and the body is returned as
// the tool result for that turn — keeping the prompt small until a skill is used.
export const loadSkill = () =>
  tool({
    description:
      'Load the full guidance for a skill by name when it is relevant to the current task ' +
      '(e.g. before designing a website, building a game, or adding animations). ' +
      'Returns the skill\'s rules and recipes. Available skills are listed in the SKILLS catalog in your system prompt.',
    inputSchema: z.object({
      name: z.string().describe(`The skill name to load. One of: ${SKILL_NAMES.join(', ')}`),
    }),
    execute: async ({ name }) => {
      const body = loadSkillBody(name)
      if (!body) {
        return `No skill named "${name}". Available: ${SKILL_NAMES.join(', ')}.`
      }
      return body
    },
  })
