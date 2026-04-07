cask "mailwing" do
  version "1.0.1"

  # Update sha256 after each release:
  #   curl -L <dmg-url> | shasum -a 256
  sha256 :no_check

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
