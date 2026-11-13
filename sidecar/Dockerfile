# The tool sidecar: a slim Kali image holding only the tools Viokit wraps.
# Not kali-linux-headless (several GB). Add a package here when a tool is
# wrapped, not before.
FROM kalilinux/kali-rolling:latest

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates \
      dnsutils \
      netbase \
      nmap \
      procps \
      whois \
 && rm -rf /var/lib/apt/lists/*

# Tools run as an unprivileged user with no access to the engine's files.
RUN useradd --create-home --uid 10001 tools
USER tools
WORKDIR /tmp

# Keep the container alive; commands arrive through `docker exec`.
ENTRYPOINT ["sleep", "infinity"]
