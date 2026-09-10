import { Node, mergeAttributes } from '@tiptap/react'
import { isMailImageSource } from '../shared/rich-body'

export const MailImage = Node.create({
  name: 'image',
  inline: true,
  group: 'inline',
  draggable: true,
  atom: true,
  addAttributes() {
    return Object.fromEntries(['src', 'alt', 'title', 'width', 'height', 'style'].map((name) => [name, { default: null }]))
  },
  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: (element) => isMailImageSource(element.getAttribute('src') ?? '') ? null : false }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)]
  }
})
