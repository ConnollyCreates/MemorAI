type FooterProps = {
	// Removed onNavigateAbout since we don't have an about page
}

const Footer = ({}: FooterProps = {}) => {
		return (
				<footer className="bg-slate-900/80 backdrop-blur-sm border-t border-white/10 text-gray-200 footer-root mt-auto">
					<div className="max-w-screen-xl mx-auto px-6 py-8">
						<div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start py-6">
							<div className="flex flex-col items-start">
								<div className="flex items-center gap-3 mb-3">
													  <a href="/" aria-label="Go to home" className="group inline-flex items-center gap-3 footer-logo">
														<img src="/memorai2.png" alt="MemorAI logo" className="h-10 w-10 rounded transition transform duration-200 group-hover:scale-105" />
														<span className="font-semibold text-lg text-cyan-400 transition transform duration-200 ease-out group-hover:scale-105 group-hover:tracking-wider" style={{ fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}>MemorAI</span>
													</a>
              
								</div>
											<p className="text-sm text-gray-400 max-w-xs">AI-powered facial recognition helping people with Alzheimer's identify and remember loved ones.</p>
							</div>

					<div>
						<h4 className="text-sm font-semibold mb-3 text-gray-200 uppercase">Features</h4>
												<ul className="space-y-2 text-sm">
																			<li><a href="#" className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors">Face Recognition</a></li>
																			<li><a href="#" className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors">AR Assistance</a></li>
																		</ul>
					</div>

					<div>
						<h4 className="text-sm font-semibold mb-3 text-gray-200 uppercase">Support</h4>
												<ul className="space-y-2 text-sm">
													<li><a href="#" className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors">Terms of Service</a></li>
													<li><a href="#" className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors">Privacy Policy</a></li>
													<li><a href="#" className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors">Help Center</a></li>
												</ul>
					</div>
				</div>

				<div className="border-t border-gray-700 mt-6 pt-6 text-center">
					<p className="text-sm text-gray-500">
						© 2025 MemorAI. All rights reserved.
					</p>
				</div>
			</div>
		</footer>
	)
}

export default Footer;
