import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Privacy Policy — Codemine',
  description: 'How Codemine collects, uses, and protects your data.',
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="July 1, 2026"
      intro="This Privacy Policy explains what information Codemine collects, how we use it, and the choices you have. This is placeholder content that will be finalized before general availability."
      sections={[
        {
          heading: 'Information we collect',
          body: [
            'We collect the information you provide when you create an account, such as your email address, and the prompts and project content you submit while building.',
            'We also collect basic technical data — like device and usage information — to operate and improve the service.',
          ],
        },
        {
          heading: 'How we use your information',
          body: [
            'We use your information to provide the service: generating, previewing, and deploying your apps, maintaining your account, and improving reliability and quality.',
            'We do not sell your personal information.',
          ],
        },
        {
          heading: 'Third-party services',
          body: [
            'To deliver Codemine we rely on trusted infrastructure and AI providers that process data on our behalf under appropriate safeguards. They may only use it to provide services to us.',
          ],
        },
        {
          heading: 'Data retention',
          body: [
            'We keep your account and project data for as long as your account is active or as needed to provide the service. You can request deletion of your data at any time.',
          ],
        },
        {
          heading: 'Security',
          body: [
            'We use industry-standard measures to protect your data. No system is perfectly secure, but we work continuously to safeguard your information.',
          ],
        },
        {
          heading: 'Your rights',
          body: [
            'Depending on where you live, you may have rights to access, correct, export, or delete your personal information. Contact us to exercise these rights.',
          ],
        },
        {
          heading: 'Contact',
          body: [
            'If you have questions about this policy or how your data is handled, reach out and we will respond.',
          ],
        },
      ]}
    />
  )
}
