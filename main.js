// My quick hacked together promise wrapper for xhttp requests
class XHR{
    call(method,url,data){
        return new Promise((resolve,reject) => {
            var xhttp = new XMLHttpRequest()
            xhttp.onreadystatechange = function() {
              if (this.readyState == 4){
                if(this.status == 200) {
                    var data = JSON.parse(this.responseText)
                    resolve(data)
                } else {
                    reject(this.status+": "+this.responseText)
                }
              }
            }
            xhttp.open(method, url, true)
            data ? xhttp.send(data) : xhttp.send()
        })
    }
    async get(url){
        return await this.call("GET",url)
    }
    async post(url,data){
        return await this.call("POST",url,data)
    }
}

function startWaiting(){
    // disable any inputs
    document.querySelectorAll('input').forEach(n => n.setAttribute('disabled',true))

    $('#loading').html(`
    <div class="bar">
        <div class="progress"></div>
    </div>
    <div class="label"></div>
    `)

    $('#loading').progress({
        total: 300
    })

    $('#update').addClass('disabled')
}

function stopWaiting(){
    // Hide the loading circle
    document.getElementById('loading').setAttribute('hidden',true)
    // reable the inputs
    document.querySelectorAll('input').forEach(n => n.removeAttribute('disabled'))
    
    // $('#loading').progress('set success')
    // $('#loading').progress('remove active')
    $('#loading').children().remove()

    $('#update').removeClass('disabled')
}

async function requestAllCourses(){
    var xhr = new XHR()
    var bookmark = null
    var hasMoreItems = true
    var courses = []
    startWaiting()
    
    while(hasMoreItems){
        var data = await xhr.get(`/d2l/api/lp/1.15/enrollments/myenrollments/?orgUnitTypeId=3${bookmark?'&Bookmark='+bookmark:''}`)
        
        $('#loading').progress('increment')
        bookmark = data.PagingInfo.Bookmark
        hasMoreItems = data.PagingInfo.HasMoreItems
        
        data.Items.forEach(course => {
            // I'm scraping just these 3 fields for simplicity,
            // there are more that I don't understand
            courses.push({
                code: course.OrgUnit.Code,
                id: course.OrgUnit.Id,
                name: course.OrgUnit.Name,
            })

        })
    }
    stopWaiting()
    return courses
}

// Using the course codes as a template, create the implied object
// Ex. "online.2017.spring" => {online: {2017: {spring: {}}}}
function bucketify(courses){
    var bucket = {}
    courses.forEach(course => {
        // Starting off on the top level
        var level = bucket
        // Interpreting the course code format as a nested object structure
        var sections = course.code.split('.')
        // Scraping everthing that dosen't start with these
        // if(["Pathway","Bridged - Online","Online","Campus"].includes(sections[0])){
            // go through each section putting it into the right buckets
            sections.forEach(section => {
                // if it doesen't already exist add our data
                level[section] = level[section] || {data:course}
                // Move down a level
                level = level[section]
            })
        // }
    })
    
    // need to remove the data attributes that are not on leaf nodes
    function cleanUp(bucket){
        if(Object.keys(bucket).length > 1){
            delete bucket.data
            Object.keys(bucket).forEach(key => cleanUp(bucket[key]))
        }
    }
    
    cleanUp(bucket)
    
    return bucket
}

// Recursivly flattens the object, preping for csv
function flatten(bucket,flattened){
    flattened = flattened || []
    if(bucket.data){
        flattened.push(bucket.data)
    } else {
        Object.keys(bucket).forEach(key => flatten(bucket[key],flattened))
    }
    return flattened
}

// Creates a dropdown containing the keys of the given object
// And adds it to our global "Levels" array, and to the html
function addDropdown(object){
    function createOption(value,shown){
        var option = document.createElement('option')
        option.value = value
        option.innerHTML = shown
        return option
    }
    // Create the select box
    var select = document.createElement('select')
    // Add our attributes
    select.onchange = () => onChange(select)
    select.classList.add('ui','dropdown')
    select['data-level'] = Levels.length
    select.appendChild(createOption("","--"))
    // Add our options
    Object.keys(object).sort().forEach(key => {
        select.appendChild(createOption(key,key))
    })
    // Adding to the html, and our "Levels"
    document.getElementById("selectsContainer").appendChild(select)
    Levels.push(select)
    return select
}


// Get the object that our current select boxess selections is implying
function currentObject(){
    var next = {
        object: Bucket,
        path: []
    }
    for(var i = 0; i < Levels.length; i ++){
        let level = Levels[i]
        
        var currentSelection = level.options[level.selectedIndex].value
        if(currentSelection){
            next.path.push(currentSelection)
            next.object = next.object[currentSelection]
        } else {
            return next
        }
    }
    return next
}

function onChange(select){
    // Delete everything after this one
    Levels.splice(select["data-level"]+1).forEach(sel => sel.parentNode.removeChild(sel))
    // Clear the search cause they ain't using it
    document.querySelector('#search').value = ""

    // If set a value
    var value = select.options[select.selectedIndex].value
    var next = currentObject()
    if(value){
        // If there are more children after this
        if(!next.object.data){
            // Add the next dropdown
            addDropdown(next.object)
        }
    }
    
    // update the link
    if(next.path.length){
        var data = flatten(next.object)
        var name = next.path.join('.')
        updateDownloadLink(data,name)
        updateTable(data)
    } else {
        updateDownloadLink(Courses,'AllCourses')
        updateTable(Courses)
    }
}

function updateTable(courses){
    $('#tableBody').children().remove()

    document.querySelector('#data').removeAttribute('hidden')

    console.log(courses.length)
    courses.slice(0,5).forEach(course => {
        $('#tableBody').append(`<tr><td>${course.code}</td><td>${course.id}</td><td>${course.name}</td></tr>`)
    })
    if(courses.length > 5){
        $('#tableBody').append(`<i class="ellipsis vertical icon"></i>`)
    }
}

function updateDownloadLink(data,fileName){ 
    fileName = fileName.replace(/\W/g,'')+'.csv'

    var a = document.getElementById("download")
    a.removeAttribute('hidden')
    a.innerHTML = fileName
    
    var csv = d3.csvFormat(data)
    var blob = new Blob([csv],{type:"octet/stream"})
    var url = window.URL.createObjectURL(blob)
    
    a.href = url
    a.download = fileName
}

var Courses,Bucket,Levels,StorageKey = "byui-courselist"

/* 
* Two different places to start, either by firing get courses when you click the update button
* Or automatically on page load if it is already in the cache
*/
async function getCourses(){
    // Get the courses
    Courses = await requestAllCourses()
    // Cache the result
    localStorage[StorageKey] = d3.csvFormat(Courses)
    setUp()
}

window.onload = function(){
    // If it is in our cache
    if(localStorage[StorageKey]){
        Courses = d3.csvParse(localStorage[StorageKey])
        setUp()
    }
}

document.querySelector('#search').onchange = function(e){
    var search = e.target.value
    var filteredList = Courses.filter(c => c.code.match(new RegExp(search,'i')))
    updateTable(filteredList)
    updateDownloadLink(filteredList,`(${search})`)
}


/* Just takes the courses and updates the other components */
function setUp() {
    if(!Courses){
        throw new Error("tried to set up before I got the courses")
    }
    // Reset my boxes
    Levels = []
    $('#selectsContainer').children().remove()
    $('#update').text('Update Courses')
    document.querySelector('#picker').removeAttribute('hidden')
    
    Bucket = bucketify(Courses);
    updateDownloadLink(Courses, 'AllCourses');
    addDropdown(Bucket);
    
}