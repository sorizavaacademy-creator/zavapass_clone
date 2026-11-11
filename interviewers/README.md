# 면접관 그림·립싱크 영상 넣는 곳 (실전 모드 면접장 화면)

- `panel3.jpg`: 면접관을 3명 고르면 보이는 면접장 사진이에요(AI로 만든 예시 이미지, 실제 인물 아님). 같은 이름으로 바꿔 넣으면 그 사진이 나와요(가로 약 16:9, 왼쪽·가운데·오른쪽에 한 명씩). 1~2명일 때는 그림 면접장이 나와요.

실전 모드 면접장은 시작할 때 `interviewers/media.json`을 읽어요. 이 파일에 적은 값이 기본 면접관 설정(`index.html`의 `IMV_INTERVIEWERS`)을 덮어써요.
코드는 고치지 않아도 되고, 파일만 올리면 돼요.

```json
{
  "hr": {
    "idleImage": "interviewers/hr/idle.png",
    "gender": "female",
    "questionVideos": {
      "greeting": "interviewers/hr/greeting.mp4",
      "Q-000123": "interviewers/hr/Q-000123.mp4",
      "closing": "interviewers/hr/closing.mp4"
    }
  },
  "lead": { "questionVideos": { "Q-000456": "interviewers/lead/Q-000456.mp4" } }
}
```

- 키(`hr`, `lead`, `exec`, `senior`, `press`, `data`, `value`, `logic`, `quiet`, `ethics`)는 면접 준비 창에서 고르는 면접관 10명의 id예요.
- `idleImage`: 기다릴 때 보이는 그림이에요. 가로:세로가 약 400:420이고 배경이 투명한 PNG가 좋아요. 비워 두면 자리표시용 그림이 나와요.
- `questionVideos`: `{ 질문ID: 영상 주소 }` 형식이에요.
  - 질문ID는 면접 DB 질문 번호(`qb_questions.id`, 화면 질문의 `qb.qid`)예요.
  - `greeting`(첫인사)와 `closing`(끝인사)도 쓸 수 있어요.
  - 그 면접관이 그 질문을 할 차례에 영상이 있으면, 목소리(TTS) 대신 영상을 재생해요(소리 포함).
  - 영상이 없거나 재생에 실패하면 지금처럼 TTS 목소리와 그림, 말하는 효과로 진행해요.
  - AI 꼬리질문은 문장이 그때그때 바뀌니 TTS 방식을 써요.
- 영상 권장: MP4(H.264 + AAC) 또는 WebM, 1:1에 가까운 세로 구도, 상반신, 어두운 배경. 영상 주소는 같은 사이트 안 경로나 CORS가 열린 주소를 쓰세요.
