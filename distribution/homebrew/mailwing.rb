cask "mailwing" do
  version "1.3.0"
  sha256 "aad016773889e4250e8073d71a42131679b91457f9bfbd7d4eb51c280c9a1365"

  url "https://github.com/vinaysamtani/mailwing/releases/download/v#{version}/Mailwing-#{version}-universal.dmg"
  name "Mailwing"
  desc "Native multi-provider desktop email client for Gmail, Outlook, Zoho, and more"
  homepage "https://github.com/vinaysamtani/mailwing"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Mailwing.app"

  zap trash: [
    "~/Library/Application Support/mailwing",
    "~/Library/Preferences/com.mailwing.app.plist",
    "~/Library/Saved Application State/com.mailwing.app.savedState",
  ]
end
