import Hero from '../sections/Hero'
import About from '../sections/About'
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
