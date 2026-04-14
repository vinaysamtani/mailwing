cask "mailwing" do
  version "1.1.0"
  sha256 "931806ffb8968f2af84afefa12605fd3a40aec60d75cd0864a8ad59c8417b030"

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
