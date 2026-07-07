#!/usr/bin/env python3
"""Embed catalogue metadata into the MP3s.

Reads data/song-meta.json (titles, credits, albums) and, when present,
data/isrc.json ({ "slug": "QT6KV..." }) and writes proper ID3 tags into
every assets/audio/*.mp3: title, artist, album artist, album, track
number, publisher, copyright, and TSRC (ISRC) once codes exist.

Run after adding audio or updating metadata, then commit the MP3s:
    python3 tools/tag-audio.py
"""
import json
import os

from mutagen.id3 import ID3, TIT2, TPE1, TPE2, TALB, TRCK, TPUB, TCOP, TSRC, COMM, ID3NoHeaderError

META = json.load(open("data/song-meta.json"))
ISRC = {}
if os.path.exists("data/isrc.json"):
    ISRC = json.load(open("data/isrc.json"))

# main artist per track: the label credit line stays in COMM; TPE1 is the artist string
ARTIST = {
    "money-or-the-power": "Old Jay ft. Ocho",
    "environmental-injustice-brave": "McCluster ft. Ocho & Evangelist Angel",
    "environmental-injustice": "McCluster ft. Ocho & Evangelist Angel",
    "vaunt": "McCluster & Zakir",
}
DEFAULT_ARTIST = "McCluster"
PUBLISHER = "McCluster Corp / M Network"
COPYRIGHT = "(C) McCluster Corp. All rights reserved."


def tag(path, slug, meta):
    try:
        id3 = ID3(path)
    except ID3NoHeaderError:
        id3 = ID3()
    artist = ARTIST.get(slug, DEFAULT_ARTIST)
    id3.setall("TIT2", [TIT2(encoding=3, text=meta.get("title", slug))])
    id3.setall("TPE1", [TPE1(encoding=3, text=artist)])
    id3.setall("TPE2", [TPE2(encoding=3, text=DEFAULT_ARTIST)])
    if meta.get("album"):
        id3.setall("TALB", [TALB(encoding=3, text=meta["album"])])
    if meta.get("order"):
        id3.setall("TRCK", [TRCK(encoding=3, text=str(meta["order"]))])
    id3.setall("TPUB", [TPUB(encoding=3, text=PUBLISHER)])
    id3.setall("TCOP", [TCOP(encoding=3, text=COPYRIGHT)])
    if meta.get("credit"):
        id3.setall("COMM", [COMM(encoding=3, lang="eng", desc="credit", text=meta["credit"])])
    if ISRC.get(slug):
        id3.setall("TSRC", [TSRC(encoding=3, text=ISRC[slug])])
    id3.save(path)
    return artist, ISRC.get(slug, "-")


def main():
    for fn in sorted(os.listdir("assets/audio")):
        if not fn.endswith(".mp3"):
            continue
        slug = fn[:-4]
        meta = META["songs"].get(slug, {"title": slug})
        artist, isrc = tag(os.path.join("assets/audio", fn), slug, meta)
        print(f"{fn:44s} {meta.get('title', slug):34s} {artist:38s} ISRC {isrc}")


if __name__ == "__main__":
    main()
