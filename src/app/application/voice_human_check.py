import re


def transcript_confirms_not_robot(transcript: str) -> bool:
    if not transcript or len(transcript.strip()) < 4:
        return False
    low = transcript.lower()
    squashed = re.sub(r"[«»\"'`]+", " ", low)
    squashed = re.sub(r"[\s.,:;!?()[\]—–\-]+", " ", squashed)
    squashed = re.sub(r"\s+", " ", squashed).strip()
    alnum = re.sub(r"[\W_]+", "", low)
    if "не робот" in squashed or "не робат" in squashed:
        return True
    if "неробот" in alnum or "янеробот" in alnum:
        return True
    if "not a robot" in squashed or "notarobot" in alnum:
        return True
    return False
