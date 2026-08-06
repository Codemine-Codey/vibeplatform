import { BRIEF_MODEL } from './constants'
import { getModelOptions } from './gateway'
import { generateText } from 'ai'
import type { ProjectBrief, Skill } from './types/project-brief'

// Generate a concise technical PRD from the design brief.
// Runs in parallel with sandbox provisioning (adds zero latency).
// Output is injected into the generation system prompt so the AI has
// a precise implementation spec — not just a design brief.
export async function generatePRD(brief: ProjectBrief, userPrompt: string): Promise<string> {
  const { skill } = brief

  const skillHint: Record<Skill, string> = {
    website: 'Focus on: component hierarchy per page, section-specific implementation (exact layout, Framer Motion usage, Unsplash image placement), nav behavior, and any tricky responsive patterns.',
    webapp: 'Focus on: exact component tree per view, function signatures for core handlers, state shape (typed), localStorage schema, and any complex UI interactions (drag-and-drop, real-time updates, etc.).',
    game: 'Focus on: the game loop structure (requestAnimationFrame approach), exact collision detection logic, entity update order, canvas coordinate system, and difficulty scaling implementation.',
  }

  try {
    const { text } = await generateText({
      ...getModelOptions(BRIEF_MODEL),
      maxOutputTokens: 1500,
      system: `You are a senior technical architect writing an implementation spec for an AI code generator.
Be specific, concrete, and implementation-focused. No fluff. No re-stating what the brief already says.
Only write what the AI code generator needs to know to write correct, complete code on the first try.`,
      messages: [{
        role: 'user',
        content:
          `Project: "${userPrompt}" (${skill})\n` +
          `Brand: ${brief.brandName ?? 'unnamed'}\n` +
          `Sections/Views: ${brief.sections?.join(', ')}\n` +
          `Features: ${brief.features?.join(', ')}\n` +
          (brief.webappDesign ? `Views: ${brief.webappDesign.views.map(v => `${v.name} (${v.route}): ${v.components.join(', ')}`).join(' | ')}\nData models: ${brief.webappDesign.dataModels?.map(m => `${m.name}: {${m.fields.join(', ')}}`).join(', ')}\n` : '') +
          (brief.gameDesign ? `Game loop: ${brief.gameDesign.coreLoop}\nEntities: ${brief.gameDesign.entities.join(', ')}\nPhysics: gravity=${brief.gameDesign.physics?.gravity}, jump=${brief.gameDesign.physics?.jumpForce}, speed=${brief.gameDesign.physics?.playerSpeed}\n` : '') +
          `\n${skillHint[skill]}\n\n` +
          `Write a technical PRD with these sections (keep each tight, 3-8 bullet points max):\n\n` +
          `## COMPONENT BREAKDOWN\n` +
          `[Each component: name, file path, key props, what it renders]\n\n` +
          `## IMPLEMENTATION REQUIREMENTS\n` +
          `[Specific technical choices and patterns the AI MUST follow — things commonly done wrong]\n\n` +
          `## CRITICAL CORRECTNESS RULES\n` +
          `[3-5 things that would cause runtime errors or broken UX if done incorrectly]`,
      }],
    })
    return text.trim()
  } catch {
    return '' // non-fatal — generation proceeds without PRD
  }
}
