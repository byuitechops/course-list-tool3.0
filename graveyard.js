
async function requestAllCourses(){
    var xhr = new XHR()
    var bookmark = null
    var hasMoreItems = true
    var courses = []
    startWaiting()
    while(hasMoreItems){
        var data = await xhr.get(`/d2l/api/lp/1.15/enrollments/myenrollments/?orgUnitTypeId=3${bookmark?'&Bookmark='+bookmark:''}`)
        
        bookmark = data.PagingInfo.Bookmark
        hasMoreItems = data.PagingInfo.HasMoreItems
        
        data.Items.forEach(course => {
            courses.push({
                code: course.OrgUnit.Code,
                id: course.OrgUnit.Id,
                name: course.OrgUnit.Name,
            })
        })
        console.log(bookmark)
    }
    stopWaiting()
    return courses
}

async function getCourses(){
    var courses = localStorage.courses
    if(!courses){
        courses = await requestAllCourses()
        localStorage.courses = d3.csvFormat(courses)
    } else {
        courses = d3.csvParse(courses)
    }
    return courses
}