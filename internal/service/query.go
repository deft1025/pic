package service

import "strconv"

const DefaultLimit = 24
const MaxLimit = 100

func ParsePage(limitString, offsetString string) (limit, offset int, err error) {
	limit = DefaultLimit
	if offsetString != "" {
		offset, err = strconv.Atoi(offsetString)
		if err != nil || offset < 0 {
			return 0, 0, &Error{Kind: ErrInvalidQuery, Message: "offset 必须是非负整数"}
		}
	}
	if limitString != "" {
		limit, err = strconv.Atoi(limitString)
		if err != nil || limit < 1 || limit > MaxLimit {
			return 0, 0, &Error{Kind: ErrInvalidQuery, Message: "limit 必须为 1–100"}
		}
	}
	return limit, offset, nil
}
