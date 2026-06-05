import Nav from '@/components/ui/Nav'
import Hero from '@/components/property/Hero'
import Properties from '@/components/property/Properties'
import WhyDirect from '@/components/ui/WhyDirect'
import HowItWorks from '@/components/ui/HowItWorks'
import ReviewStrip from '@/components/ui/ReviewStrip'
import Newsletter from '@/components/ui/Newsletter'
import Footer from '@/components/ui/Footer'

export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      <Properties />
      <WhyDirect />
      <ReviewStrip />
      <HowItWorks />
      <Newsletter />
      <Footer />
    </>
  )
}
