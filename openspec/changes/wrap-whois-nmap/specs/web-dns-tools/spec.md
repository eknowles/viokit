## Purpose

Wraps `whois` and `nmap` as sources whose output becomes entities and relations from the shared vocabulary, so their results join the same investigation graph as other tools.

## ADDED Requirements

### Requirement: whois derives name servers, an owner and contacts
The system SHALL project a `whois` record into the queried domain, one domain per name server linked by `delegated-to`, one organization per registrant organization linked by `owned-by`, and one email address per registrant, admin or tech email linked by `contact-for`. It SHALL derive nothing from a field a registry has redacted, and nothing at all from an answer with no recognised field.

#### Scenario: A thin registry record
- **WHEN** a record lists two name servers and no registrant
- **THEN** the projection yields the queried domain, two name-server domains, and two `delegated-to` relations

#### Scenario: Redacted contact fields
- **WHEN** a registrant, admin or tech email field says it is redacted or asks to query another service
- **THEN** no email address or relation is derived from it

#### Scenario: No match
- **WHEN** the answer says no match was found
- **THEN** the projection yields nothing

### Requirement: nmap derives open ports and the technologies on them
The system SHALL project an `nmap` XML scan into the scanned IP address, one open-port per open port linked from the address by `hosts`, and, where service detection named a product, one technology linked from the port by `runs`. It SHALL derive nothing from closed or filtered ports, and nothing at all from a scan that found no open port.

#### Scenario: A scan with open ports
- **WHEN** a scan reports three open ports with detected products
- **THEN** the projection yields the address, three open-ports with `hosts` relations, and a technology for each product with `runs` relations

#### Scenario: Nothing open
- **WHEN** every scanned port is closed or filtered
- **THEN** the projection yields nothing

#### Scenario: Escaped text in a banner
- **WHEN** a product name contains XML-escaped characters
- **THEN** the technology carries the decoded text

### Requirement: Tools meet on shared nodes
The system SHALL give an IP address the same entity identity whichever tool reports it, so a `dig` result and an `nmap` result for one address are one node.

#### Scenario: dig and nmap on one address
- **WHEN** `dig` resolves a name to an address and `nmap` scans that address
- **THEN** both projections produce the same IP-address entity

### Requirement: Both tools run through the sidecar
The system SHALL run both tools through the exec transport with typed, validated input, and SHALL classify `whois` as passive and `nmap` as active.

#### Scenario: Option-shaped input
- **WHEN** an address value begins with `-`
- **THEN** the transform fails naming the parameter and the command is not started
