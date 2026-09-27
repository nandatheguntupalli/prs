// Renders the Homebrew formula for a release, given the sha256 of each target's tarball
export const TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
] as const;
export type Target = (typeof TARGETS)[number];

export function formula(version: string, sha: Record<Target, string>) {
  const base = `https://github.com/nandatheguntupalli/prs/releases/download/v${version}`;
  const asset = (t: Target) =>
    `      url "${base}/prs-${t}.tar.gz"\n      sha256 "${sha[t]}"`;

  return `class Prs < Formula
  desc "Superhuman for pull requests: a keyboard-first TUI for reviewing and merging PRs"
  homepage "https://github.com/nandatheguntupalli/prs"
  version "${version}"
  license "MIT"

  depends_on "gh"

  on_macos do
    on_arm do
${asset("darwin-arm64")}
    end
    on_intel do
${asset("darwin-x64")}
    end
  end

  on_linux do
    on_arm do
${asset("linux-arm64")}
    end
    on_intel do
${asset("linux-x64")}
    end
  end

  def install
    bin.install "prs"
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/prs --version").strip
  end
end
`;
}
