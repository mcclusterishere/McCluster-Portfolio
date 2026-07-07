#!/usr/bin/env python3
"""M Network DDEX ERN generator.

Turns one of our release manifests (data/releases/<id>.json) into a
DDEX ERN NewReleaseMessage — the XML that DSP delivery pipelines speak.
Owning this means our metadata is born delivery-grade: partners are a
transport, never the system of record.

Usage:
    python3 scripts/ddex-ern.py data/releases/heal-the-3.json
Writes dist/ddex/<release_id>/<message_id>.xml

Manifest shape (all business data lives in the manifest, not the code):
{
  "release_id": "heal-the-3", "title": "Heal the 3", "kind": "EP",
  "label": "McCluster Corp / M Network", "upc": "",
  "release_date": "2026-08-01", "genre": "Hip Hop",
  "party": { "name": "Matthew McCluster", "role": "MainArtist" },
  "tracks": [
    { "id": "heal-the-three", "title": "Heal the Three", "isrc": "QT6KV2600001",
      "duration_s": 180, "audio": "assets/audio/heal-the-three.mp3",
      "splits": [ { "party": "Matthew McCluster", "role": "Composer", "pct": 100 } ] }
  ]
}
"""
import json
import os
import sys
import time
from xml.sax.saxutils import escape


def iso_duration(seconds):
    m, s = divmod(int(seconds or 0), 60)
    h, m = divmod(m, 60)
    return "PT" + (f"{h}H" if h else "") + (f"{m}M" if m else "") + f"{s}S"


def build(manifest):
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    msg_id = f"MNET-{manifest['release_id']}-{int(time.time())}"
    label = escape(manifest.get("label", "McCluster Corp / M Network"))
    artist = escape(manifest["party"]["name"])
    lines = []
    a = lines.append
    a('<?xml version="1.0" encoding="UTF-8"?>')
    a('<ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/43" ReleaseProfileVersionId="Audio">')
    a("  <MessageHeader>")
    a(f"    <MessageId>{msg_id}</MessageId>")
    a("    <MessageSender><PartyName><FullName>%s</FullName></PartyName></MessageSender>" % label)
    a(f"    <MessageCreatedDateTime>{now}</MessageCreatedDateTime>")
    a("  </MessageHeader>")

    # resources: one SoundRecording per track
    a("  <ResourceList>")
    for i, t in enumerate(manifest["tracks"], 1):
        ref = f"A{i}"
        a("    <SoundRecording>")
        a(f"      <ResourceReference>{ref}</ResourceReference>")
        a("      <SoundRecordingEdition><ResourceId>")
        a(f"        <ISRC>{escape(t.get('isrc', ''))}</ISRC>")
        a("      </ResourceId></SoundRecordingEdition>")
        a(f"      <DisplayTitleText>{escape(t['title'])}</DisplayTitleText>")
        a(f"      <DisplayArtistName>{artist}</DisplayArtistName>")
        a(f"      <Duration>{iso_duration(t.get('duration_s'))}</Duration>")
        for sp in t.get("splits", []):
            a("      <Contributor>")
            a(f"        <PartyName><FullName>{escape(sp['party'])}</FullName></PartyName>")
            a(f"        <Role>{escape(sp['role'])}</Role>")
            a("      </Contributor>")
        a("    </SoundRecording>")
    a("  </ResourceList>")

    # the release itself
    a("  <ReleaseList>")
    a("    <Release>")
    a("      <ReleaseReference>R0</ReleaseReference>")
    a("      <ReleaseId>" + (f"<ICPN>{escape(manifest['upc'])}</ICPN>" if manifest.get("upc") else "<ProprietaryId Namespace=\"MNET\">%s</ProprietaryId>" % escape(manifest["release_id"])) + "</ReleaseId>")
    a(f"      <DisplayTitleText>{escape(manifest['title'])}</DisplayTitleText>")
    a(f"      <DisplayArtistName>{artist}</DisplayArtistName>")
    a(f"      <ReleaseType>{escape(manifest.get('kind', 'Single'))}</ReleaseType>")
    a(f"      <Genre><GenreText>{escape(manifest.get('genre', 'Hip Hop'))}</GenreText></Genre>")
    a("      <ResourceGroup>")
    for i, t in enumerate(manifest["tracks"], 1):
        a("        <ResourceGroupContentItem>")
        a(f"          <SequenceNumber>{i}</SequenceNumber>")
        a(f"          <ReleaseResourceReference>A{i}</ReleaseResourceReference>")
        a("        </ResourceGroupContentItem>")
    a("      </ResourceGroup>")
    a("    </Release>")
    a("  </ReleaseList>")

    # a simple worldwide deal from release date
    a("  <DealList><ReleaseDeal>")
    a("    <DealReleaseReference>R0</DealReleaseReference>")
    a("    <Deal><DealTerms>")
    a("      <TerritoryCode>Worldwide</TerritoryCode>")
    a(f"      <StartDate>{escape(manifest.get('release_date', ''))}</StartDate>")
    a("      <CommercialModelType>SubscriptionModel</CommercialModelType>")
    a("      <UseType>OnDemandStream</UseType>")
    a("    </DealTerms></Deal>")
    a("  </ReleaseDeal></DealList>")
    a("</ern:NewReleaseMessage>")
    return msg_id, "\n".join(lines)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    manifest = json.load(open(sys.argv[1]))
    msg_id, doc = build(manifest)
    outdir = os.path.join("dist", "ddex", manifest["release_id"])
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, msg_id + ".xml")
    with open(path, "w") as f:
        f.write(doc)
    # well-formedness check
    import xml.dom.minidom
    xml.dom.minidom.parseString(doc)
    print(f"ERN written and well-formed: {path}")


if __name__ == "__main__":
    main()
