cask "mailwing" do
  version "1.2.1"
  sha256 "7258414df2e7d8515aa549939b9111d7104a017bd0b909f30b05e87ffe558fef"

  url "https://github.com/vinaysamtani/mailwing/releases/download/v#{version}/Mailwing-#{version}-universal.dmg"
  name "Mailwing"
  desc "Native multi-provider desktop email client (Gmail, Zoho, Outlook)"
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
