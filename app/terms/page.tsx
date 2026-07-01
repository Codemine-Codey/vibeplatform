import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Terms & Conditions — Codemine',
  description: 'The terms that govern your use of Codemine.',
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      updated="July 1, 2026"
      intro="These Terms & Conditions govern your access to and use of Codemine, the AI web-building platform. By creating an account or using the service, you agree to these terms. This is placeholder legal content and will be replaced with final language before general availability."
      sections={[
        {
          heading: 'Acceptance of terms',
          body: [
            'By accessing or using Codemine, you confirm that you can form a binding contract and that you accept these terms in full. If you do not agree, you may not use the service.',
            'We may update these terms from time to time. Continued use after changes take effect means you accept the revised terms.',
          ],
        },
        {
          heading: 'Your account',
          body: [
            'You are responsible for the activity that happens under your account and for keeping your credentials secure. Notify us promptly of any unauthorized use.',
            'You must provide accurate information when registering and keep it up to date.',
          ],
        },
        {
          heading: 'Acceptable use',
          body: [
            'You agree not to use Codemine to build or distribute unlawful, harmful, or infringing content, or to attempt to disrupt or reverse-engineer the platform.',
            'We may suspend or terminate accounts that violate these rules or put the service or other users at risk.',
          ],
        },
        {
          heading: 'Your content and ownership',
          body: [
            'You retain ownership of the applications and content you create with Codemine. You grant us the limited rights needed to host, build, and deploy your projects on your behalf.',
            'You are responsible for ensuring you have the rights to any material you provide as input.',
          ],
        },
        {
          heading: 'Service availability',
          body: [
            'Codemine is provided on an "as is" and "as available" basis. We work to keep the service reliable but do not guarantee uninterrupted or error-free operation.',
          ],
        },
        {
          heading: 'Limitation of liability',
          body: [
            'To the maximum extent permitted by law, Codemine is not liable for indirect, incidental, or consequential damages arising from your use of the service.',
          ],
        },
        {
          heading: 'Contact',
          body: [
            'If you have questions about these terms, contact us and we will be happy to help clarify.',
          ],
        },
      ]}
    />
  )
}
