import Hero from '../sections/Hero'
import About from '../sections/About'
// DEFECT: ./sections/Contact was never generated and is not in the manifest.
import Contact from '../sections/Contact'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Hero />
      <About />
      <Contact />
    </div>
  )
}
