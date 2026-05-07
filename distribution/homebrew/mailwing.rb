cask "mailwing" do
  version "1.2.0"
  sha256 "6ad90f065217a000069a171560697f06edb7fff7ad00243ebf125929e6f14498"

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
