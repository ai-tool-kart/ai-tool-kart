import { describe, expect, it } from 'vitest'
import { toolDetail } from '@/test/adminFixtures'
import { approvalFieldErrors, diffToolDraft, toolFieldErrors, toToolDraft } from '@/utils/adminForms'

describe('approvalFieldErrors', () => {
  it('maps nested server paths onto the form inputs, first message wins', () => {
    expect(
      approvalFieldErrors({
        'tool.roles.0': 'Invalid role',
        'tool.roles.1': 'Also invalid',
        'tool.id': 'must be lowercase',
        'tool.summary': 'Too short',
      }),
    ).toEqual({ roles: 'Invalid role', slug: 'must be lowercase', summary: 'Too short' })
  })
})

describe('toolFieldErrors', () => {
  it('collapses array paths to the field', () => {
    expect(toolFieldErrors({ 'tags.0': 'Too long', url: 'Bad URL' })).toEqual({ tags: 'Too long', url: 'Bad URL' })
  })
})

describe('diffToolDraft', () => {
  const original = toToolDraft(toolDetail().tool)

  it('is empty when nothing changed', () => {
    expect(diffToolDraft(original, { ...original })).toEqual({})
  })

  it('sends only changed fields, tags as a list and an emptied plain line as null', () => {
    const withLine = toToolDraft({ ...toolDetail().tool, plainLine: 'Helps you write.' })
    expect(diffToolDraft(withLine, { ...withLine, name: 'New', tags: ' a, b ,, ', plainLine: '  ', verified: true })).toEqual({
      name: 'New',
      tags: ['a', 'b'],
      plainLine: null,
      verified: true,
    })
  })

  it('never includes identifiers or publication status', () => {
    const keys = Object.keys(toToolDraft(toolDetail().tool))
    for (const forbidden of ['id', 'slug', 'status', 'rating', 'reviews', 'pop', 'source']) expect(keys).not.toContain(forbidden)
  })
})
