import { Mail } from 'lucide-react'
import { defineRendererFeature } from '../../../platform/renderer/define-feature'

export const mailTemplateFeature = defineRendererFeature({
  id: 'mail-template',
  order: 25,
  navigation: { label: '邮件模板', icon: Mail, group: 'primary' },
  route: {
    path: '/mail-templates',
    load: () => import('./MailTemplatePage').then(({ MailTemplatePage }) => ({ default: MailTemplatePage }))
  },
  status: 'stable'
})
