require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "BackhaulTracking"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.license      = "UNLICENSED"
  s.authors      = "Backhaul"
  s.homepage     = "https://github.com/nobledeveloper01/backhaul"
  # Whatever the app supports, not a number of this library's own. React
  # Native pins it (15.1 at 0.87), and a library that raised it here would
  # fail `pod install` with "required a higher minimum deployment target" —
  # which reads as a CocoaPods problem rather than as a line in this file.
  s.platforms    = min_supported_versions
  s.source       = { :git => "https://github.com/nobledeveloper01/backhaul.git" }

  s.source_files = "ios/**/*.{h,m,mm}"

  # CoreLocation for the fixes; sqlite3 for the queue they are written to.
  #
  # Declared here rather than added to the app's Xcode project by hand: a
  # linker flag buried in `project.pbxproj` is a linker flag nobody finds when
  # the build breaks on somebody else's machine.
  s.frameworks   = "CoreLocation"
  s.libraries    = "sqlite3"

  install_modules_dependencies(s)
end
